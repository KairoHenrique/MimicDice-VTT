/** How an object looked the last time the player saw it; `x`/`y` is the top-left of its bounds. */
export interface RememberedLook {
  documentName: "Tile" | "Note";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  alpha: number;
  src: string;
}

export interface PresentObject {
  look: RememberedLook;
  inSight: boolean;
}

export interface Reconciled {
  /** Present objects the player sees right now. */
  shown: Set<string>;
  /** Last-seen looks to draw where the real object is out of sight (or already gone). */
  ghosts: Array<[string, RememberedLook]>;
  changed: boolean;
}

function sameLook(left: RememberedLook | undefined, right: RememberedLook): boolean {
  return Boolean(left) && left!.x === right.x && left!.y === right.y && left!.width === right.width && left!.height === right.height && left!.rotation === right.rotation && left!.alpha === right.alpha && left!.src === right.src;
}

/**
 * Objects in sight refresh the memory; out of sight they show as the remembered look. When the remembered spot is in
 * sight but the object is not there anymore, the player learns it is gone and the memory is dropped.
 */
export function reconcileSightMemory(memory: Map<string, RememberedLook>, present: Map<string, PresentObject>, isLookInSight: (look: RememberedLook) => boolean): Reconciled {
  const shown = new Set<string>();
  const ghosts: Array<[string, RememberedLook]> = [];
  let changed = false;
  for (const [key, object] of present) {
    if (!object.inSight) continue;
    shown.add(key);
    if (!sameLook(memory.get(key), object.look)) {
      memory.set(key, object.look);
      changed = true;
    }
  }
  for (const [key, look] of memory) {
    if (shown.has(key)) continue;
    if (isLookInSight(look)) {
      memory.delete(key);
      changed = true;
      continue;
    }
    ghosts.push([key, look]);
  }
  return { shown, ghosts, changed };
}

const MAX_REMEMBERED = 2000;
const MAX_SRC_LENGTH = 2048;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Parses stored memory defensively: localStorage can hold anything. */
export function parseStoredMemory(raw: string | null): Map<string, RememberedLook> {
  const memory = new Map<string, RememberedLook>();
  if (!raw) return memory;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return memory;
  }
  if (!parsed || typeof parsed !== "object") return memory;
  for (const [key, value] of Object.entries(parsed as Record<string, any>).slice(0, MAX_REMEMBERED)) {
    if (!value || (value.documentName !== "Tile" && value.documentName !== "Note")) continue;
    const numbers = [value.x, value.y, value.width, value.height, value.rotation, value.alpha];
    if (!numbers.every(isFiniteNumber) || typeof value.src !== "string" || value.src.length > MAX_SRC_LENGTH) continue;
    memory.set(key, { documentName: value.documentName, x: value.x, y: value.y, width: value.width, height: value.height, rotation: value.rotation, alpha: value.alpha, src: value.src });
  }
  return memory;
}

export function serializeMemory(memory: Map<string, RememberedLook>): string {
  return JSON.stringify(Object.fromEntries([...memory].slice(-MAX_REMEMBERED)));
}
