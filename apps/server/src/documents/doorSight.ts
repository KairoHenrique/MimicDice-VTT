import { DOOR_STATES, WALL_DOOR_TYPE_NONE, type PlainObject } from "@tabbletop/common";

export interface SightPoint {
  x: number;
  y: number;
}

export interface SightSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const DOOR_PROBE_OFFSET_PX = 12;
const DOOR_PROBE_FRACTIONS = [0.5, 0.2, 0.8] as const;
const SIGHT_NONE = 0;
const DEFAULT_GRID_SIZE = 100;

function orientation(p: SightPoint, q: SightPoint, r: SightPoint): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

/** Proper crossing only: touching an end point does not count, as on the client. */
export function segmentsCross(from: SightPoint, to: SightPoint, wall: SightSegment): boolean {
  const a = { x: wall.ax, y: wall.ay };
  const b = { x: wall.bx, y: wall.by };
  const d1 = orientation(a, b, from);
  const d2 = orientation(a, b, to);
  const d3 = orientation(from, to, a);
  const d4 = orientation(from, to, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function wallSegment(wall: PlainObject): SightSegment | null {
  const coords = Array.isArray(wall.c) ? wall.c.map(Number) : [];
  if (coords.length !== 4 || coords.some((value) => !Number.isFinite(value))) return null;
  const [ax, ay, bx, by] = coords as [number, number, number, number];
  return { ax, ay, bx, by };
}

function blocksSight(wall: PlainObject): boolean {
  const isOpenDoor = Number(wall.door) > WALL_DOOR_TYPE_NONE && Number(wall.ds) === DOOR_STATES.OPEN;
  return !isOpenDoor && Number(wall.sight ?? 1) !== SIGHT_NONE;
}

/** Points just to either side of the door, since the door itself lies on the line that blocks sight. */
function doorProbes(door: SightSegment): SightPoint[] {
  const length = Math.hypot(door.bx - door.ax, door.by - door.ay) || 1;
  const offset = Math.min(DOOR_PROBE_OFFSET_PX, length / 2);
  const normalX = (-(door.by - door.ay) / length) * offset;
  const normalY = ((door.bx - door.ax) / length) * offset;
  return DOOR_PROBE_FRACTIONS.flatMap((fraction) => {
    const x = door.ax + (door.bx - door.ax) * fraction;
    const y = door.ay + (door.by - door.ay) * fraction;
    return [
      { x: x + normalX, y: y + normalY },
      { x: x - normalX, y: y - normalY },
    ];
  });
}

/** Whether any of the eyes has an unobstructed line to the door through the scene's other sight-blocking walls. */
export function isDoorSeen(door: PlainObject, eyes: readonly SightPoint[], walls: readonly PlainObject[]): boolean {
  const doorSegment = wallSegment(door);
  if (!doorSegment || eyes.length === 0) return false;
  const blockers = walls.filter((wall) => wall !== door && wall._id !== door._id && blocksSight(wall)).flatMap((wall) => wallSegment(wall) ?? []);
  const probes = doorProbes(doorSegment);
  return eyes.some((eye) => probes.some((probe) => !blockers.some((blocker) => segmentsCross(eye, probe, blocker))));
}

/** Center of a token in scene pixels. */
export function tokenEye(token: PlainObject, gridSize: number): SightPoint | null {
  const size = gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
  const x = Number(token.x) + (Number(token.width) || 1) * size / 2;
  const y = Number(token.y) + (Number(token.height) || 1) * size / 2;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
