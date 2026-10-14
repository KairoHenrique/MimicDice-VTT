import * as PIXI from "pixi.js";
import { Hooks } from "../hooks/Hooks";
import { currentConfig, currentGame, currentUi } from "../runtime";
import { clamp, type Point } from "./geometry";
import { computeSceneDimensions, SquareGrid, type SceneDimensions } from "./grid";
import { ControlsLayer, EffectsCanvasGroup, InterfaceCanvasGroup, PrimaryCanvasGroup } from "./compatGroups";
import { CanvasHud } from "./hud/CanvasHud";
import { CanvasInteraction } from "./interaction/CanvasInteraction";
import type { CanvasLayer, InteractionLayer, PlaceablesLayer } from "./layers/CanvasLayer";
import { DrawingsLayer, GridLayer, LightingLayer, NotesLayer, RegionLayer, TemplateLayer, TilesLayer, TokenLayer, WallsLayer } from "./layers/placeableLayers";
import { VisibilityLayer } from "./perception/VisibilityLayer";
import { PingEffects } from "./interface/PingEffect";
import { colorToNumber, loadTexture } from "./textures";

const DEFAULT_LAYER = "tokens";
const PAN_ANIMATION_MS = 250;

const CORE_LAYERS = {
  grid: { layerClass: GridLayer, group: "interface" },
  tiles: { layerClass: TilesLayer, group: "primary" },
  drawings: { layerClass: DrawingsLayer, group: "primary" },
  templates: { layerClass: TemplateLayer, group: "interface" },
  regions: { layerClass: RegionLayer, group: "interface" },
  tokens: { layerClass: TokenLayer, group: "primary" },
  visibility: { layerClass: VisibilityLayer, group: "rendered" },
  walls: { layerClass: WallsLayer, group: "interface" },
  lighting: { layerClass: LightingLayer, group: "interface" },
  notes: { layerClass: NotesLayer, group: "interface" },
} as const;

/** Stacking for package layers that do not choose their own zIndex, by the canvas group they asked for. */
const GROUP_Z_INDEX: Record<string, number> = { primary: 300, effects: 600, rendered: 600, interface: 950 };

interface LayerConfiguration {
  layerClass: new () => CanvasLayer;
  group?: string;
}

/**
 * The game board. One PIXI application lives for the whole session; `draw(scene)` tears down and rebuilds
 * the layers for a scene. Hook order matches Foundry: canvasInit, draw<Layer>, canvasReady, canvasTearDown.
 */
export class Canvas {
  app: PIXI.Application | null = null;
  stage: PIXI.Container | null = null;
  scene: any = null;
  dimensions: SceneDimensions | null = null;
  grid: SquareGrid | null = null;
  ready = false;
  loading = false;
  activeLayer: InteractionLayer | null = null;

  readonly hud = new CanvasHud();
  readonly interaction = new CanvasInteraction(this);
  readonly background = new PIXI.Container();
  readonly primary = new PrimaryCanvasGroup();
  readonly interface = new InterfaceCanvasGroup();
  readonly effects = new EffectsCanvasGroup();
  readonly controls = new ControlsLayer();
  readonly masks = { vision: new PIXI.Container() };
  readonly performance = { mode: 2, blur: { enabled: false, strength: 0 }, textures: { enabled: true }, mipmap: "ON", msaa: false, smaa: false };
  readonly sounds = { getListenerPositions: (): Point[] => this.tokens.controlled.map((token: any) => token.center) };
  readonly mouseInteractionManager = { isDragging: false, cancel: (): void => undefined, reset: (): void => undefined };
  readonly loadTexture = loadTexture;

  readonly tokens = new TokenLayer();
  readonly tiles = new TilesLayer();
  readonly drawings = new DrawingsLayer();
  readonly templates = new TemplateLayer();
  readonly walls = new WallsLayer();
  readonly regions = new RegionLayer();
  readonly lighting = new LightingLayer();
  readonly notes = new NotesLayer();
  readonly visibility = new VisibilityLayer();
  readonly gridLayer = new GridLayer();

  readonly perception = {
    update: () => this.visibility.update(),
    isTokenVisible: (token: any) => this.visibility.isTokenVisible(token),
  };

  #drawQueue: Promise<unknown> = Promise.resolve();
  #board: HTMLElement | null = null;
  readonly #packageLayers: CanvasLayer[] = [];

  /** Core layer configuration; packages merge their own entries into a copy and assign it to `CONFIG.Canvas.layers`. */
  static get layers(): Record<string, { layerClass: unknown; group: string }> {
    return Object.fromEntries(Object.entries(CORE_LAYERS).map(([name, entry]) => [name, { ...entry }]));
  }

  get id(): string | null {
    return this.scene?.id ?? null;
  }

  get layers(): CanvasLayer[] {
    return [this.gridLayer, this.tiles, this.drawings, this.templates, this.regions, this.tokens, this.visibility, this.walls, this.lighting, this.notes, ...this.#packageLayers];
  }

  /** Instantiates layers that packages added to `CONFIG.Canvas.layers`, exposing each as `canvas[name]`. */
  #createPackageLayers(): void {
    const configured = (currentConfig()?.Canvas?.layers ?? {}) as Record<string, LayerConfiguration>;
    for (const [name, entry] of Object.entries(configured)) {
      if (name in CORE_LAYERS || name in this || typeof entry?.layerClass !== "function") continue;
      try {
        const layer = new entry.layerClass();
        layer.zIndex = layer.options?.zIndex || (GROUP_Z_INDEX[entry.group ?? ""] ?? GROUP_Z_INDEX.effects);
        Object.defineProperty(this, name, { value: layer, configurable: true, enumerable: true });
        this.#packageLayers.push(layer);
      } catch (error) {
        Hooks.onError("Canvas#createPackageLayers", error, { msg: `Falha ao criar a camada ${name}`, log: "error" });
      }
    }
  }

  get placeableLayers(): PlaceablesLayer[] {
    return [this.tokens, this.tiles, this.drawings, this.templates, this.walls, this.lighting, this.notes];
  }

  get mousePosition(): Point {
    return this.interaction.worldPosition;
  }

  get screenDimensions(): [number, number] {
    return this.app ? [this.app.screen.width, this.app.screen.height] : [0, 0];
  }

  /** Blur post-processing is not implemented; kept so packages can call it after zoom changes. */
  updateBlur(): void {}

  get initialized(): boolean {
    return this.app !== null;
  }

  getLayerByEmbeddedName(embeddedName: string): PlaceablesLayer | null {
    return this.placeableLayers.find((layer) => layer.documentName === embeddedName) ?? null;
  }

  /** Creates the renderer once; `noCanvas` users get no board at all (dice and sheets still work). */
  initialize(board: HTMLElement): void {
    if (this.app) return;
    this.#board = board;
    const app = new PIXI.Application({ resizeTo: board, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), backgroundColor: 0x1b1b1f, powerPreference: "high-performance" });
    const view = app.view as HTMLCanvasElement;
    view.id = "board-canvas";
    board.replaceChildren(view);
    this.app = app;
    this.stage = app.stage;
    this.stage.sortableChildren = true;
    this.interface.zIndex = 900;
    this.primary.zIndex = 250;
    this.effects.zIndex = 590;
    this.background.zIndex = 0;
    this.#createPackageLayers();
    this.stage.addChild(this.background, this.primary, this.effects, this.interface, ...this.layers);
    for (const layer of this.layers) if (!this.#packageLayers.includes(layer)) layer.zIndex = layer.options.zIndex;
    for (const decoration of [this.background, this.primary, this.effects, this.interface, this.gridLayer, this.visibility]) decoration.eventMode = "none";
    for (const layer of this.placeableLayers) layer.eventMode = "passive";
    this.interface.addChild(this.interaction.overlay, this.interaction.label);
    this.interface.sortableChildren = true;
    this.#pings = new PingEffects(this.interface, app.ticker);
    this.interface.grid = this.gridLayer;
    this.interaction.attach(view, board);
    app.renderer.on("resize", () => this.pan());
    Hooks.callAll("canvasConfig", { app, view });
  }

  /** Serialised so rapid scene switches never interleave two draws. */
  draw(scene: any = currentGame()?.scenes?.active ?? null): Promise<this> {
    const next = this.#drawQueue.then(() => this.#draw(scene)).catch((error) => Hooks.onError("Canvas#draw", error, { msg: "Falha ao desenhar a cena", log: "error", notify: "error" }));
    this.#drawQueue = next;
    return next.then(() => this);
  }

  async #draw(scene: any): Promise<void> {
    if (!this.app || !this.stage) return;
    await this.tearDown();
    this.scene = scene;
    this.#board?.classList.toggle("no-scene", !scene);
    if (!scene) {
      currentUi()?.controls?.render?.();
      return;
    }
    this.loading = true;
    this.dimensions = computeSceneDimensions(scene._source);
    const grid = scene._source.grid ?? {};
    this.grid = new SquareGrid({ type: Number(grid.type ?? 1), size: this.dimensions.size, distance: this.dimensions.distance, units: this.dimensions.units, style: String(grid.style ?? "solidLines"), thickness: Number(grid.thickness ?? 1), color: String(grid.color ?? "#000000"), alpha: Number(grid.alpha ?? 0.2) });
    Hooks.callAll("canvasInit", this);
    await this.#drawBackground(scene);
    for (const layer of this.layers) await layer.draw();
    this.tokens.addChildAt(this.visibility.illumination, 0);
    this.loading = false;
    this.ready = true;
    const controlName = currentUi()?.controls?.control?.layer ?? DEFAULT_LAYER;
    ((this as any)[controlName] ?? this.tokens).activate();
    this.#panToInitialView(scene);
    currentUi()?.controls?.render?.();
    Hooks.callAll("canvasReady", this);
  }

  async #drawBackground(scene: any): Promise<void> {
    const dimensions = this.dimensions as SceneDimensions;
    const padding = new PIXI.Graphics().beginFill(0x000000, 0.25).drawRect(0, 0, dimensions.width, dimensions.height).endFill();
    const fill = new PIXI.Graphics().beginFill(colorToNumber(scene._source.backgroundColor, 0x999999), 1).drawRect(dimensions.sceneX, dimensions.sceneY, dimensions.sceneWidth, dimensions.sceneHeight).endFill();
    this.background.addChild(padding, fill);
    const texture = await loadTexture(scene._source.background?.src);
    if (!texture) return;
    const sprite = new PIXI.Sprite(texture);
    sprite.position.set(dimensions.sceneX, dimensions.sceneY);
    sprite.width = dimensions.sceneWidth;
    sprite.height = dimensions.sceneHeight;
    sprite.tint = colorToNumber(scene._source.background?.tint, 0xffffff);
    this.background.addChild(sprite);
  }

  async tearDown(): Promise<this> {
    if (!this.scene && !this.ready) return this;
    Hooks.callAll("canvasTearDown", this);
    this.ready = false;
    this.hud.closeMenu();
    this.hud.cancelMoveConfirmation();
    this.activeLayer?.deactivate();
    this.activeLayer = null;
    this.#pings?.clear();
    for (const layer of [...this.layers].reverse()) await layer.tearDown();
    this.background.removeChildren().forEach((child) => child.destroy());
    this.scene = null;
    return this;
  }

  /** Centers the view on a canvas point; `scale` is clamped to the zoom range. */
  pan({ x, y, scale }: { x?: number; y?: number; scale?: number } = {}): void {
    const stage = this.stage;
    if (!stage || !this.app) return;
    const dimensions = this.dimensions;
    if (scale !== undefined) stage.scale.set(clamp(scale, 0.1, 3));
    const targetX = x ?? stage.pivot.x;
    const targetY = y ?? stage.pivot.y;
    stage.pivot.set(dimensions ? clamp(targetX, 0, dimensions.width) : targetX, dimensions ? clamp(targetY, 0, dimensions.height) : targetY);
    stage.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
    Hooks.callAll("canvasPan", this, { x: stage.pivot.x, y: stage.pivot.y, scale: stage.scale.x });
  }

  async animatePan({ x, y, scale, duration = PAN_ANIMATION_MS }: { x?: number; y?: number; scale?: number; duration?: number } = {}): Promise<void> {
    const stage = this.stage;
    if (!stage || !this.app) return;
    this.#stopPanAnimation?.();
    const from = { x: stage.pivot.x, y: stage.pivot.y, scale: stage.scale.x };
    const to = { x: x ?? from.x, y: y ?? from.y, scale: scale ?? from.scale };
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const stop = () => {
        this.app?.ticker.remove(step);
        if (this.#stopPanAnimation === stop) this.#stopPanAnimation = null;
        resolve();
      };
      const step = () => {
        const progress = Math.min((performance.now() - startedAt) / Math.max(duration, 1), 1);
        const eased = progress * (2 - progress);
        this.pan({ x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased, scale: from.scale + (to.scale - from.scale) * eased });
        if (progress >= 1) stop();
      };
      this.#stopPanAnimation = stop;
      this.app?.ticker.add(step);
    });
  }

  /** A newer pan replaces one still running, so the last requested view always wins. */
  #stopPanAnimation: (() => void) | null = null;

  #pings: PingEffects | null = null;

  /** Highlights a point of the current scene for a few seconds; `color` is a CSS hex string. */
  async ping(origin: Point, { color, label, size }: { color?: string; label?: string; size?: number } = {}): Promise<void> {
    if (!this.ready || !this.#pings) return;
    const gridSize = this.dimensions?.size ?? 100;
    await this.#pings.play(origin, { color: colorToNumber(color, 0xff6400), label, size: size ?? gridSize * 2 });
  }

  #panToInitialView(scene: any): void {
    const dimensions = this.dimensions as SceneDimensions;
    const initial = scene._source.initial as { x?: number; y?: number; scale?: number } | null;
    const owned = this.tokens.ownedTokens[0];
    if (owned && !currentGame()?.user?.isGM) {
      this.pan({ ...owned.center, scale: 1 });
      return;
    }
    if (initial && Number.isFinite(initial.x) && Number.isFinite(initial.y)) {
      this.pan({ x: initial.x, y: initial.y, scale: initial.scale ?? 1 });
      return;
    }
    const screen = this.app?.screen;
    const fitScale = screen ? Math.min(screen.width / dimensions.sceneWidth, screen.height / dimensions.sceneHeight) * 0.95 : 1;
    this.pan({ x: dimensions.sceneX + dimensions.sceneWidth / 2, y: dimensions.sceneY + dimensions.sceneHeight / 2, scale: fitScale });
  }

  canvasCoordinatesFromClient(client: Point): Point {
    const view = this.app?.view as HTMLCanvasElement | undefined;
    if (!view || !this.stage) return client;
    const rect = view.getBoundingClientRect();
    return this.stage.toLocal({ x: client.x - rect.left, y: client.y - rect.top });
  }

  clientCoordinatesFromCanvas(point: Point): Point {
    const view = this.app?.view as HTMLCanvasElement | undefined;
    if (!view || !this.stage) return point;
    const rect = view.getBoundingClientRect();
    const global = this.stage.toGlobal(point);
    return { x: global.x + rect.left, y: global.y + rect.top };
  }
}
