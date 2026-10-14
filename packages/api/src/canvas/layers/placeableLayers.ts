import * as PIXI from "pixi.js";
import { currentCanvas, currentGame } from "../../runtime";
import type { Point } from "../geometry";
import { testWallCollision } from "../geometryClasses";
import type { SceneDimensions, SquareGrid } from "../grid";
import { colorToNumber } from "../textures";
import type { Token } from "../placeables/Token";
import { CanvasLayer, PlaceablesLayer } from "./CanvasLayer";

export class TokenLayer extends PlaceablesLayer {
  static override documentName = "Token";
  static override layerOptions = { name: "tokens", zIndex: 200 };

  get ownedTokens(): Token[] {
    const user = currentGame()?.user;
    return (this.placeables as Token[]).filter((token) => token.document.testUserPermission?.(user, "OWNER"));
  }

  /** Tokens whose eyes the current user looks through: controlled ones first, otherwise every owned token (players only). */
  get visionSources(): Token[] {
    const controlled = this.controlled as Token[];
    if (controlled.length > 0) return controlled;
    if (currentGame()?.user?.isGM) return [];
    return this.ownedTokens;
  }
}

export class TilesLayer extends PlaceablesLayer {
  static override documentName = "Tile";
  static override layerOptions = { name: "tiles", zIndex: 100 };
}

export class DrawingsLayer extends PlaceablesLayer {
  static override documentName = "Drawing";
  static override layerOptions = { name: "drawings", zIndex: 120 };
}

export class TemplateLayer extends PlaceablesLayer {
  static override documentName = "MeasuredTemplate";
  static override layerOptions = { name: "templates", zIndex: 150 };
}

export class WallsLayer extends PlaceablesLayer {
  static override documentName = "Wall";
  static override layerOptions = { name: "walls", zIndex: 700 };

  /** Door controls answer clicks from every layer; each wall line only listens while this layer is active. */
  protected override async _draw(): Promise<void> {
    await super._draw();
    this.objects.interactiveChildren = true;
  }

  protected override _deactivate(): void {
    super._deactivate();
    this.objects.interactiveChildren = true;
  }

  checkCollision(ray: { A: Point; B: Point }, { type = "move", mode = "any" }: { type?: "sight" | "light" | "move" | "sound"; mode?: string } = {}): boolean | Point[] {
    return testWallCollision(ray.A, ray.B, { type, mode });
  }
}

/** Scene regions are not supported yet: the layer is always empty, but packages can iterate it safely. */
export class RegionLayer extends PlaceablesLayer {
  static override documentName = "Region";
  static override layerOptions = { name: "regions", zIndex: 160 };

  override get documentCollection(): null {
    return null;
  }
}

export class LightingLayer extends PlaceablesLayer {
  static override documentName = "AmbientLight";
  static override layerOptions = { name: "lighting", zIndex: 710 };
}

export class NotesLayer extends PlaceablesLayer {
  static override documentName = "Note";
  static override layerOptions = { name: "notes", zIndex: 800 };
}

/** Grid lines over the scene rectangle; redrawn only when the scene changes. */
export class GridLayer extends CanvasLayer {
  static override layerOptions = { name: "grid", zIndex: 50 };
  #mesh = new PIXI.Graphics();
  readonly #highlightLayers = new Map<string, PIXI.Graphics>();

  /** `tearDown` destroys every child between scenes, so the grid graphic is rebuilt on demand. */
  get mesh(): PIXI.Graphics {
    if (this.#mesh.destroyed) this.#mesh = new PIXI.Graphics();
    return this.#mesh;
  }

  /** Named highlight graphics; owners add them to their own display tree, this layer only tracks them by name. */
  getHighlightLayer(name: string): PIXI.Graphics {
    let layer = this.#highlightLayers.get(name);
    if (!layer || layer.destroyed) {
      layer = new PIXI.Graphics();
      this.#highlightLayers.set(name, layer);
    }
    return layer;
  }

  addHighlightLayer(name: string): PIXI.Graphics {
    return this.getHighlightLayer(name);
  }

  clearHighlightLayer(name: string): void {
    const layer = this.#highlightLayers.get(name);
    if (layer && !layer.destroyed) layer.clear();
  }

  destroyHighlightLayer(name: string): void {
    this.#highlightLayers.delete(name);
  }

  highlightPosition(name: string, { x, y, color = 0x33bbff, alpha = 0.25 }: { x: number; y: number; color?: number; alpha?: number }): void {
    const grid = currentCanvas().grid as SquareGrid;
    const layer = this.getHighlightLayer(name);
    if (!layer.parent && !layer.destroyed) this.addChild(layer);
    layer.beginFill(color, alpha).drawRect(x, y, grid.size, grid.size).endFill();
  }

  protected override async _draw(): Promise<void> {
    const canvas = currentCanvas();
    this.addChild(this.mesh);
    this.#drawLines(canvas.grid as SquareGrid, canvas.dimensions as SceneDimensions);
  }

  #drawLines(grid: SquareGrid, dimensions: SceneDimensions): void {
    const mesh = this.mesh;
    mesh.clear();
    if (grid.isGridless || grid.alpha <= 0) return;
    const { x, y, width, height } = dimensions.sceneRect;
    mesh.lineStyle({ width: Math.max(grid.thickness, 1), color: colorToNumber(grid.color, 0x000000), alpha: grid.alpha, native: grid.thickness <= 1 });
    for (let column = x; column <= x + width + 0.5; column += grid.size) mesh.moveTo(column, y).lineTo(column, y + height);
    for (let row = y; row <= y + height + 0.5; row += grid.size) mesh.moveTo(x, row).lineTo(x + width, row);
  }
}
