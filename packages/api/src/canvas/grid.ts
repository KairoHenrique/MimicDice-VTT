import { CONST } from "../constants";
import type { Point, Rectangle } from "./geometry";

export type SnapMode = "corner" | "center" | "half" | "quarter";

export interface GridConfiguration {
  type: number;
  size: number;
  distance: number;
  units: string;
  style: string;
  thickness: number;
  color: string;
  alpha: number;
}

export interface SceneDimensions {
  width: number;
  height: number;
  size: number;
  distance: number;
  distancePixels: number;
  units: string;
  sceneX: number;
  sceneY: number;
  sceneWidth: number;
  sceneHeight: number;
  sceneRect: Rectangle;
  rect: Rectangle;
  maxR: number;
}

/** Square grid with Chebyshev distance (diagonals cost one square), plus a gridless variant when `type` is 0. */
export class SquareGrid {
  readonly type: number;
  readonly size: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly distance: number;
  readonly units: string;
  readonly style: string;
  readonly thickness: number;
  readonly color: string;
  readonly alpha: number;

  constructor(configuration: GridConfiguration) {
    this.type = configuration.type;
    this.size = configuration.size;
    this.sizeX = configuration.size;
    this.sizeY = configuration.size;
    this.distance = configuration.distance;
    this.units = configuration.units;
    this.style = configuration.style;
    this.thickness = configuration.thickness;
    this.color = configuration.color;
    this.alpha = configuration.alpha;
  }

  get isGridless(): boolean {
    return this.type === CONST.GRID_TYPES.GRIDLESS;
  }

  get isSquare(): boolean {
    return this.type === CONST.GRID_TYPES.SQUARE;
  }

  get isHexagonal(): boolean {
    return false;
  }

  getOffset({ x, y }: Point): { i: number; j: number } {
    return { i: Math.floor(y / this.size), j: Math.floor(x / this.size) };
  }

  getTopLeftPoint({ i, j }: { i: number; j: number }): Point {
    return { x: j * this.size, y: i * this.size };
  }

  getCenterPoint({ i, j }: { i: number; j: number }): Point {
    return { x: (j + 0.5) * this.size, y: (i + 0.5) * this.size };
  }

  /** Snaps to grid vertices (`mode` "corner"), cell centers ("center"), half-steps ("half") or quarter-steps ("quarter"). */
  getSnappedPoint({ x, y }: Point, { mode = "corner" }: { mode?: SnapMode } = {}): Point {
    if (this.isGridless) return { x, y };
    const step = mode === "half" ? this.size / 2 : mode === "quarter" ? this.size / 4 : this.size;
    const offset = mode === "center" ? this.size / 2 : 0;
    return { x: Math.round((x - offset) / step) * step + offset, y: Math.round((y - offset) / step) * step + offset };
  }

  measureDistance(from: Point, to: Point): number {
    const deltaX = Math.abs(to.x - from.x) / this.size;
    const deltaY = Math.abs(to.y - from.y) / this.size;
    const squares = this.isGridless ? Math.hypot(deltaX, deltaY) : Math.max(Math.round(deltaX), Math.round(deltaY));
    return Math.round(squares * this.distance * 100) / 100;
  }

  measurePath(waypoints: Point[]): { distance: number; spaces: number; segments: Array<{ distance: number }> } {
    const segments: Array<{ distance: number }> = [];
    let total = 0;
    for (let index = 1; index < waypoints.length; index += 1) {
      const distance = this.measureDistance(waypoints[index - 1], waypoints[index]);
      segments.push({ distance });
      total += distance;
    }
    return { distance: total, spaces: Math.round(total / this.distance), segments };
  }
}

export function computeSceneDimensions(source: Record<string, any>): SceneDimensions {
  const grid = source.grid ?? {};
  const size = Math.max(20, Number(grid.size) || 100);
  const distance = Number(grid.distance) || 1.5;
  const sceneWidth = Math.max(100, Number(source.width) || 4000);
  const sceneHeight = Math.max(100, Number(source.height) || 3000);
  const padding = Math.min(Math.max(Number(source.padding) || 0, 0), 0.5);
  const paddingX = Math.ceil((sceneWidth * padding) / size) * size;
  const paddingY = Math.ceil((sceneHeight * padding) / size) * size;
  const width = sceneWidth + paddingX * 2;
  const height = sceneHeight + paddingY * 2;
  return {
    width,
    height,
    size,
    distance,
    distancePixels: size / distance,
    units: String(grid.units ?? ""),
    sceneX: paddingX,
    sceneY: paddingY,
    sceneWidth,
    sceneHeight,
    sceneRect: { x: paddingX, y: paddingY, width: sceneWidth, height: sceneHeight },
    rect: { x: 0, y: 0, width, height },
    maxR: Math.hypot(width, height),
  };
}
