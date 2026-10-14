import * as PIXI from "pixi.js";
import { currentCanvas } from "../runtime";
import { computeVisibilityPolygon, segmentsCross, type Point, type Segment } from "./geometry";

/** A directed segment from A to B with cached slope data, as used by package math. */
export class Ray {
  readonly A: Point;
  readonly B: Point;
  readonly dx: number;
  readonly dy: number;
  readonly y0: number;
  readonly x0: number;
  readonly slope: number;
  #angle: number | undefined;
  #distance: number | undefined;

  constructor(origin: Point, destination: Point) {
    this.A = { x: Number(origin.x), y: Number(origin.y) };
    this.B = { x: Number(destination.x), y: Number(destination.y) };
    this.x0 = this.A.x;
    this.y0 = this.A.y;
    this.dx = this.B.x - this.A.x;
    this.dy = this.B.y - this.A.y;
    this.slope = this.dy / this.dx;
  }

  get angle(): number {
    this.#angle ??= Math.atan2(this.dy, this.dx);
    return this.#angle;
  }

  set angle(value: number) {
    this.#angle = Number(value);
  }

  get distance(): number {
    this.#distance ??= Math.hypot(this.dx, this.dy);
    return this.#distance;
  }

  get bounds(): PIXI.Rectangle {
    return new PIXI.Rectangle(Math.min(this.A.x, this.B.x), Math.min(this.A.y, this.B.y), Math.abs(this.dx), Math.abs(this.dy));
  }

  static fromAngle(x: number, y: number, radians: number, distance: number): Ray {
    const ray = new this({ x, y }, { x: x + Math.cos(radians) * distance, y: y + Math.sin(radians) * distance });
    ray.angle = radians;
    return ray;
  }

  static fromArrays(origin: number[], destination: number[]): Ray {
    return new this({ x: origin[0], y: origin[1] }, { x: destination[0], y: destination[1] });
  }

  /** A ray starting at `origin`, aimed at `target`, with a fixed length. */
  static towardsPoint(origin: Point, target: Point, distance: number): Ray {
    const radians = Math.atan2(target.y - origin.y, target.x - origin.x);
    return this.fromAngle(origin.x, origin.y, radians, distance);
  }

  project(fraction: number): Point {
    return { x: this.A.x + fraction * this.dx, y: this.A.y + fraction * this.dy };
  }

  reverse(): Ray {
    const reversed = new Ray(this.B, this.A);
    reversed.#distance = this.#distance;
    return reversed;
  }

  shiftAngle(offset: number, distance: number = this.distance): Ray {
    return Ray.fromAngle(this.A.x, this.A.y, this.angle + offset, distance);
  }
}

type WallSense = "sight" | "light" | "move" | "sound";

function blockingSegments(type: WallSense): Segment[] {
  const sense = type === "sound" ? "sight" : type;
  const walls = (currentCanvas()?.walls?.placeables ?? []) as Array<{ blocks(sense: string): boolean; segment: Segment }>;
  return walls.filter((wall) => wall.blocks(sense)).map((wall) => wall.segment);
}

/** True when the straight path from `origin` to `destination` crosses a wall that blocks `type`. */
export function testWallCollision(origin: Point, destination: Point, { type = "move", mode = "any" }: { type?: WallSense; mode?: string } = {}): boolean | Point[] {
  const hits = blockingSegments(type).filter((segment) => segmentsCross(origin, destination, segment));
  if (mode === "all") return hits.map((segment) => ({ x: (segment.ax + segment.bx) / 2, y: (segment.ay + segment.by) / 2 }));
  return hits.length > 0;
}

/** Visibility polygon around an origin, reusing the same sweep that powers token vision. */
export class ClockwiseSweepPolygon extends PIXI.Polygon {
  origin: Point = { x: 0, y: 0 };
  config: Record<string, unknown> = {};

  static create(origin: Point, config: { type?: WallSense; radius?: number; [key: string]: unknown } = {}): ClockwiseSweepPolygon {
    const polygon = new this();
    polygon.initialize(origin, config);
    return polygon.compute();
  }

  static testCollision(origin: Point, destination: Point, config: { type?: WallSense; mode?: string } = {}): boolean | Point[] {
    return testWallCollision(origin, destination, config);
  }

  initialize(origin: Point, config: Record<string, unknown>): void {
    this.origin = { x: Number(origin.x), y: Number(origin.y) };
    this.config = { type: "sight", ...config };
  }

  compute(): this {
    const canvas = currentCanvas();
    const bounds = canvas?.dimensions?.rect ?? { x: 0, y: 0, width: 4000, height: 3000 };
    const radius = Number(this.config.radius) > 0 ? Number(this.config.radius) : Infinity;
    this.points = computeVisibilityPolygon(this.origin, radius, blockingSegments(this.config.type as WallSense), bounds);
    return this;
  }
}
