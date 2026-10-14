import * as PIXI from "pixi.js";
import { PLAYER_VISION_LIMIT_SETTING_KEY } from "@tabbletop/protocol";
import { Hooks } from "../../hooks/Hooks";
import { currentCanvas, currentGame } from "../../runtime";
import { computeVisibilityPolygon, type Point, type Segment } from "../geometry";
import type { SceneDimensions } from "../grid";
import { CanvasLayer } from "../layers/CanvasLayer";
import type { Token } from "../placeables/Token";
import type { AmbientLight, Wall } from "../placeables/simplePlaceables";
import { FogExplorationStore } from "./FogExplorationStore";

const [VISION_LIMIT_NAMESPACE, VISION_LIMIT_KEY] = PLAYER_VISION_LIMIT_SETTING_KEY.split(".") as [string, string];
const MAX_FOG_TEXTURE_SIZE = 2048;
const EXPLORED_REVEAL_ALPHA = 0.45;

interface VisionShapes {
  sight: PIXI.Polygon[];
  lineOfSight: PIXI.Polygon[];
  lights: PIXI.Polygon[];
}

/**
 * Token vision and fog of war. Each frame with pending changes recomputes wall-bounded polygons, then
 * paints a darkness render texture: opaque black, explored areas partially erased, visible areas fully erased.
 */
export class VisibilityLayer extends CanvasLayer {
  static override layerOptions = { name: "visibility", zIndex: 600 };

  readonly illumination = new PIXI.Container();
  #overlaySprite: PIXI.Sprite | null = null;
  #overlayTexture: PIXI.RenderTexture | null = null;
  #explorationTexture: PIXI.RenderTexture | null = null;
  #textureScale = 1;
  #shapes: VisionShapes = { sight: [], lineOfSight: [], lights: [] };
  #dirty = true;
  #fogStore: FogExplorationStore | null = null;
  #tick = () => this.#refreshIfDirty();

  get tokenVision(): boolean {
    return currentCanvas()?.scene?._source.tokenVision === true;
  }

  get globalLight(): boolean {
    return currentCanvas()?.scene?._source.environment?.globalLight?.enabled !== false;
  }

  /** How far players may see, in scene distance units, as set by the GM; 0 means no limit. Never limits the GM. */
  get playerVisionLimit(): number {
    const game = currentGame();
    if (!game?.user || game.user.isGM) return 0;
    try {
      const limit = Number(game.settings.get(VISION_LIMIT_NAMESPACE, VISION_LIMIT_KEY));
      return Number.isFinite(limit) && limit > 0 ? limit : 0;
    } catch {
      return 0;
    }
  }

  /** True when fog applies to the current user right now. */
  get active(): boolean {
    if (!this.tokenVision && this.playerVisionLimit === 0) return false;
    const sources = currentCanvas()?.tokens?.visionSources ?? [];
    return !currentGame()?.user?.isGM || sources.length > 0;
  }

  update(): void {
    this.#dirty = true;
  }

  protected override async _draw(): Promise<void> {
    const canvas = currentCanvas();
    const dimensions = canvas.dimensions as SceneDimensions;
    this.#textureScale = Math.min(1, MAX_FOG_TEXTURE_SIZE / Math.max(dimensions.width, dimensions.height));
    const textureOptions = { width: Math.ceil(dimensions.width * this.#textureScale), height: Math.ceil(dimensions.height * this.#textureScale) };
    this.#overlayTexture = PIXI.RenderTexture.create(textureOptions);
    this.#explorationTexture = PIXI.RenderTexture.create(textureOptions);
    this.#overlaySprite = new PIXI.Sprite(this.#overlayTexture);
    this.#overlaySprite.scale.set(1 / this.#textureScale);
    this.addChild(this.#overlaySprite);
    this.#fogStore = new FogExplorationStore(canvas.scene.id, currentGame()?.userId ?? "", canvas.app.renderer, this.#explorationTexture);
    if (canvas.scene._source.fog?.exploration !== false) await this.#fogStore.restore();
    this.#dirty = true;
    canvas.app.ticker.add(this.#tick);
  }

  override async tearDown(): Promise<this> {
    currentCanvas()?.app?.ticker?.remove(this.#tick);
    this.#fogStore?.flush();
    this.#fogStore = null;
    this.illumination.removeChildren().forEach((child) => child.destroy());
    await super.tearDown();
    this.#overlayTexture?.destroy(true);
    this.#explorationTexture?.destroy(true);
    this.#overlayTexture = null;
    this.#explorationTexture = null;
    this.#overlaySprite = null;
    this.#shapes = { sight: [], lineOfSight: [], lights: [] };
    return this;
  }

  isPointVisible(point: Point): boolean {
    if (!this.active) return true;
    const { sight, lineOfSight, lights } = this.#shapes;
    if (sight.some((polygon) => polygon.contains(point.x, point.y))) return true;
    if (!lineOfSight.some((polygon) => polygon.contains(point.x, point.y))) return false;
    return lights.some((polygon) => polygon.contains(point.x, point.y));
  }

  isTokenVisible(token: Token): boolean {
    if (!this.active || token.isOwner) return true;
    const { x, y, width, height } = token.bounds;
    const inset = Math.min(width, height) * 0.2;
    const probes: Point[] = [token.center, { x: x + inset, y: y + inset }, { x: x + width - inset, y: y + inset }, { x: x + inset, y: y + height - inset }, { x: x + width - inset, y: y + height - inset }];
    return probes.some((probe) => this.isPointVisible(probe));
  }

  #refreshIfDirty(): void {
    if (!this.#dirty || !this.#overlayTexture) return;
    this.#dirty = false;
    const canvas = currentCanvas();
    const sightWalls = this.#wallSegments("sight");
    this.#shapes = this.#computeShapes(canvas, sightWalls);
    this.#drawIllumination(canvas);
    this.#renderOverlay(canvas);
    for (const token of canvas.tokens?.placeables ?? []) token.visible = token.isVisible;
    Hooks.callAll("sightRefresh", this);
  }

  #wallSegments(sense: "sight" | "light"): Segment[] {
    const walls = (currentCanvas()?.walls?.placeables ?? []) as Wall[];
    return walls.filter((wall) => wall.blocks(sense)).map((wall) => wall.segment);
  }

  #computeShapes(canvas: any, sightWalls: Segment[]): VisionShapes {
    const dimensions = canvas.dimensions as SceneDimensions;
    const bounds = dimensions.sceneRect;
    const visionLimit = this.playerVisionLimit;
    const shapes: VisionShapes = { sight: [], lineOfSight: [], lights: [] };
    for (const token of canvas.tokens.visionSources as Token[]) {
      const origin = token.center;
      const limitRadius = visionLimit > 0 ? visionLimit * dimensions.distancePixels + Math.max(token.w, token.h) / 2 : Infinity;
      const lineOfSight = computeVisibilityPolygon(origin, limitRadius, sightWalls, bounds);
      shapes.lineOfSight.push(new PIXI.Polygon(lineOfSight));
      const tokenRange = this.globalLight ? 0 : token.sightRange;
      const range = tokenRange > 0 ? Math.min(tokenRange, limitRadius) : limitRadius;
      shapes.sight.push(new PIXI.Polygon(range === limitRadius ? lineOfSight : computeVisibilityPolygon(origin, range, sightWalls, bounds)));
    }
    if (!this.globalLight) shapes.lights = this.#lightPolygons(canvas).map(({ polygon }) => polygon);
    return shapes;
  }

  #lightPolygons(canvas: any): Array<{ light: AmbientLight; polygon: PIXI.Polygon }> {
    const bounds = (canvas.dimensions as SceneDimensions).sceneRect;
    const lightWalls = this.#wallSegments("light");
    const lights = (canvas.lighting?.placeables ?? []) as AmbientLight[];
    return lights
      .filter((light) => light.emitsLight)
      .map((light) => {
        const walls = light.document.walls === false ? [] : lightWalls;
        return { light, polygon: new PIXI.Polygon(computeVisibilityPolygon({ x: light.document.x, y: light.document.y }, light.radius, walls, bounds)) };
      });
  }

  #drawIllumination(canvas: any): void {
    this.illumination.removeChildren().forEach((child) => child.destroy());
    const glow = new PIXI.Graphics();
    for (const { light, polygon } of this.#lightPolygons(canvas)) {
      const alpha = Math.min(Math.max(Number(light.document.config?.alpha ?? 0.5), 0), 1) * 0.45;
      glow.beginFill(light.color, alpha).drawPolygon(polygon).endFill();
    }
    this.illumination.addChild(glow);
  }

  #renderOverlay(canvas: any): void {
    const renderer = canvas.app.renderer as PIXI.Renderer;
    const overlayTexture = this.#overlayTexture as PIXI.RenderTexture;
    const sprite = this.#overlaySprite as PIXI.Sprite;
    sprite.visible = this.active;
    if (!this.active) return;
    const transform = new PIXI.Matrix().scale(this.#textureScale, this.#textureScale);
    const darkness = new PIXI.Graphics().beginFill(0x000000, 1).drawRect(0, 0, canvas.dimensions.width, canvas.dimensions.height).endFill();
    renderer.render(darkness, { renderTexture: overlayTexture, clear: true, transform });
    darkness.destroy();
    if (canvas.scene._source.fog?.exploration !== false && this.#explorationTexture) {
      const exploredNow = this.#visibleAreaGraphics(PIXI.BLEND_MODES.NORMAL);
      renderer.render(exploredNow, { renderTexture: this.#explorationTexture, clear: false, transform });
      exploredNow.destroy({ children: true });
      const explored = new PIXI.Sprite(this.#explorationTexture);
      explored.blendMode = PIXI.BLEND_MODES.ERASE;
      explored.alpha = EXPLORED_REVEAL_ALPHA;
      renderer.render(explored, { renderTexture: overlayTexture, clear: false });
      explored.destroy();
      this.#fogStore?.scheduleSave();
    }
    const visibleNow = this.#visibleAreaGraphics(PIXI.BLEND_MODES.ERASE);
    renderer.render(visibleNow, { renderTexture: overlayTexture, clear: false, transform });
    visibleNow.destroy({ children: true });
  }

  /**
   * White shapes of everything visible now: sight polygons plus lit areas clipped by line of sight.
   * PIXI v7 caches a Graphics' blend mode in its batches on first render, so each pass builds fresh graphics.
   */
  #visibleAreaGraphics(blendMode: PIXI.BLEND_MODES): PIXI.Container {
    const container = new PIXI.Container();
    const sight = new PIXI.Graphics();
    sight.blendMode = blendMode;
    for (const polygon of this.#shapes.sight) sight.beginFill(0xffffff, 1).drawPolygon(polygon).endFill();
    container.addChild(sight);
    if (this.#shapes.lights.length > 0) {
      const lit = new PIXI.Graphics();
      lit.blendMode = blendMode;
      for (const polygon of this.#shapes.lights) lit.beginFill(0xffffff, 1).drawPolygon(polygon).endFill();
      const mask = new PIXI.Graphics();
      for (const polygon of this.#shapes.lineOfSight) mask.beginFill(0xffffff, 1).drawPolygon(polygon).endFill();
      lit.mask = mask;
      container.addChild(mask, lit);
    }
    return container;
  }
}
