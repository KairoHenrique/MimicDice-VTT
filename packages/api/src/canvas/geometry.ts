export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EPSILON_ANGLE = 1e-4;
const CIRCLE_RAY_COUNT = 96;

/** Returns the parametric distance along the ray to the segment, or Infinity when they do not meet. */
function rayHitDistance(originX: number, originY: number, directionX: number, directionY: number, segment: Segment): number {
  const segmentX = segment.bx - segment.ax;
  const segmentY = segment.by - segment.ay;
  const denominator = directionX * segmentY - directionY * segmentX;
  if (Math.abs(denominator) < 1e-12) return Infinity;
  const offsetX = segment.ax - originX;
  const offsetY = segment.ay - originY;
  const rayDistance = (offsetX * segmentY - offsetY * segmentX) / denominator;
  const segmentPosition = (offsetX * directionY - offsetY * directionX) / denominator;
  if (rayDistance < 0 || segmentPosition < 0 || segmentPosition > 1) return Infinity;
  return rayDistance;
}

function boundarySegments(bounds: Rectangle): Segment[] {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return [
    { ax: bounds.x, ay: bounds.y, bx: right, by: bounds.y },
    { ax: right, ay: bounds.y, bx: right, by: bottom },
    { ax: right, ay: bottom, bx: bounds.x, by: bottom },
    { ax: bounds.x, ay: bottom, bx: bounds.x, by: bounds.y },
  ];
}

function segmentNearCircle(segment: Segment, origin: Point, radius: number): boolean {
  if (!Number.isFinite(radius)) return true;
  const minX = Math.min(segment.ax, segment.bx) - radius;
  const maxX = Math.max(segment.ax, segment.bx) + radius;
  const minY = Math.min(segment.ay, segment.by) - radius;
  const maxY = Math.max(segment.ay, segment.by) + radius;
  return origin.x >= minX && origin.x <= maxX && origin.y >= minY && origin.y <= maxY;
}

function collectRayAngles(origin: Point, segments: readonly Segment[], includeCircle: boolean): number[] {
  const angles: number[] = [];
  for (const segment of segments) {
    for (const [pointX, pointY] of [[segment.ax, segment.ay], [segment.bx, segment.by]]) {
      const angle = Math.atan2(pointY - origin.y, pointX - origin.x);
      angles.push(angle - EPSILON_ANGLE, angle, angle + EPSILON_ANGLE);
    }
  }
  if (includeCircle) {
    for (let index = 0; index < CIRCLE_RAY_COUNT; index += 1) angles.push(-Math.PI + (index * 2 * Math.PI) / CIRCLE_RAY_COUNT);
  }
  return angles.sort((left, right) => left - right);
}

/**
 * Line-of-sight polygon from `origin`, blocked by `walls` and clipped to `radius` and `bounds`.
 * Cost is O(rays x walls); walls outside the radius are discarded first. Returns flat [x0, y0, x1, y1, ...].
 */
export function computeVisibilityPolygon(origin: Point, radius: number, walls: readonly Segment[], bounds: Rectangle): number[] {
  const limited = Number.isFinite(radius) && radius > 0;
  const nearbyWalls = walls.filter((wall) => segmentNearCircle(wall, origin, limited ? radius : Infinity));
  const blockers = [...nearbyWalls, ...boundarySegments(bounds)];
  const angles = collectRayAngles(origin, blockers, limited);
  const points: number[] = [];
  for (const angle of angles) {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    let nearest = limited ? radius : Infinity;
    for (const blocker of blockers) {
      const distance = rayHitDistance(origin.x, origin.y, directionX, directionY, blocker);
      if (distance < nearest) nearest = distance;
    }
    if (!Number.isFinite(nearest)) continue;
    points.push(origin.x + directionX * nearest, origin.y + directionY * nearest);
  }
  return points;
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

/** True when the open segments properly cross (touching endpoints do not count as a crossing). */
export function segmentsCross(from: Point, to: Point, wall: Segment): boolean {
  const first = orientation(from.x, from.y, to.x, to.y, wall.ax, wall.ay);
  const second = orientation(from.x, from.y, to.x, to.y, wall.bx, wall.by);
  const third = orientation(wall.ax, wall.ay, wall.bx, wall.by, from.x, from.y);
  const fourth = orientation(wall.ax, wall.ay, wall.bx, wall.by, to.x, to.y);
  return first !== second && third !== fourth && first !== 0 && second !== 0 && third !== 0 && fourth !== 0;
}

export function distanceBetween(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
