import { deepClone, flattenObject, getProperty, type PlainObject } from "@tabbletop/common";

export type HistoryEntry =
  | { action: "create"; documentName: string; ids: string[] }
  | { action: "update"; documentName: string; updates: PlainObject[] }
  | { action: "delete"; documentName: string; data: PlainObject[] };

export interface HistoryStep {
  sceneId: string;
  entries: HistoryEntry[];
}

export const HISTORY_LIMIT = 50;

/** The patch that puts every field touched by `changes` back to what `source` held before. */
export function inverseUpdate(source: PlainObject, changes: PlainObject): PlainObject {
  const inverse: PlainObject = { _id: source._id };
  for (const key of Object.keys(flattenObject(changes))) {
    if (key === "_id") continue;
    const cleanKey = key.replace(/(^|\.)-=/g, "$1");
    const before = getProperty(source, cleanKey);
    if (before !== undefined) {
      inverse[cleanKey] = deepClone(before);
      continue;
    }
    const cut = cleanKey.lastIndexOf(".");
    inverse[cut < 0 ? `-=${cleanKey}` : `${cleanKey.slice(0, cut)}.-=${cleanKey.slice(cut + 1)}`] = null;
  }
  return inverse;
}

/** A bounded undo stack; consecutive records within one burst (one drag, one batch delete) form a single step. */
export class CanvasHistory {
  #steps: HistoryStep[] = [];
  #open: HistoryStep | null = null;
  #lastRecordAt = -Infinity;

  constructor(private readonly burstMs = 0) {}

  /** Records made within `burstMs` of the previous one join its step; `now` is a monotonic clock in ms. */
  record(sceneId: string, entry: HistoryEntry, now = 0): void {
    if (now - this.#lastRecordAt > this.burstMs) this.#open = null;
    this.#lastRecordAt = now;
    if (!this.#open || this.#open.sceneId !== sceneId) {
      this.#open = { sceneId, entries: [] };
      this.#steps.push(this.#open);
      if (this.#steps.length > HISTORY_LIMIT) this.#steps.shift();
    }
    this.#open.entries.push(entry);
  }

  /** Ends the current burst so the next record starts a new step. */
  seal(): void {
    this.#open = null;
  }

  pop(): HistoryStep | null {
    this.#open = null;
    return this.#steps.pop() ?? null;
  }

  clear(): void {
    this.#steps = [];
    this.#open = null;
  }

  get size(): number {
    return this.#steps.length;
  }
}
