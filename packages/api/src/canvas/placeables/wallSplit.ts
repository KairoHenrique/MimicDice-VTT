import type { Point, Segment } from "../geometry";

/** Pieces shorter than this would be impossible to grab, so a cut that close to an end is refused. */
export const MIN_WALL_PIECE_PX = 8;
const ON_SEGMENT_TOLERANCE_PX = 2;

function projectOnSegment(segment: Segment, point: Point): { point: Point; fraction: number; distance: number } {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0 ? 0 : ((point.x - segment.ax) * dx + (point.y - segment.ay) * dy) / lengthSquared;
  const clamped = Math.min(1, Math.max(0, fraction));
  const projected = { x: segment.ax + dx * clamped, y: segment.ay + dy * clamped };
  return { point: projected, fraction: clamped, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
}

/**
 * Where a double click cuts a wall: on the grid corner the user aimed at when that corner lies on the wall, otherwise
 * on the wall right under the cursor. `null` when the cut would leave a piece too short to use.
 */
export function wallSplitPoint(segment: Segment, click: Point, snappedCorner: Point | null): Point | null {
  const length = Math.hypot(segment.bx - segment.ax, segment.by - segment.ay);
  if (length < MIN_WALL_PIECE_PX * 2) return null;
  const corner = snappedCorner ? projectOnSegment(segment, snappedCorner) : null;
  const target = corner && corner.distance <= ON_SEGMENT_TOLERANCE_PX ? corner : projectOnSegment(segment, click);
  const distanceFromStart = target.fraction * length;
  if (distanceFromStart < MIN_WALL_PIECE_PX || length - distanceFromStart < MIN_WALL_PIECE_PX) return null;
  return { x: Math.round(target.point.x), y: Math.round(target.point.y) };
}
