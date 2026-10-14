export interface GridMeasure {
  size: number;
  distance: number;
  gridless: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface TurnMovement {
  combatantId: string;
  round: number;
  distance: number;
}

/** Same rule as the movement ruler: diagonals cost one square on a grid, straight lines on a gridless map. */
export function measureMove(from: Point, to: Point, grid: GridMeasure): number {
  if (!(grid.size > 0)) return 0;
  const columns = Math.abs(to.x - from.x) / grid.size;
  const rows = Math.abs(to.y - from.y) / grid.size;
  const squares = grid.gridless ? Math.hypot(columns, rows) : Math.max(Math.round(columns), Math.round(rows));
  return Math.round(squares * grid.distance * 100) / 100;
}

export function readTurnMovement(raw: unknown): TurnMovement | null {
  if (!raw || typeof raw !== "object") return null;
  const { combatantId, round, distance } = raw as Partial<TurnMovement>;
  if (typeof combatantId !== "string" || typeof round !== "number" || typeof distance !== "number" || !Number.isFinite(distance)) return null;
  return { combatantId, round, distance: Math.max(0, distance) };
}

/** Distance walked by the combatant acting now; anything stored for an earlier turn counts as zero. */
export function movedThisTurn(stored: TurnMovement | null, combatantId: string | null, round: number): number {
  if (!stored || !combatantId || stored.combatantId !== combatantId || stored.round !== round) return 0;
  return stored.distance;
}

export function formatDistance(distance: number, units: string, gridDistance: number): string {
  const amount = String(Math.round(distance * 100) / 100).replace(".", ",");
  const squares = gridDistance > 0 ? Math.round(distance / gridDistance) : null;
  const unitLabel = units ? ` ${units}` : "";
  return squares === null ? `${amount}${unitLabel}` : `${amount}${unitLabel} (${squares} ${squares === 1 ? "quadrado" : "quadrados"})`;
}
