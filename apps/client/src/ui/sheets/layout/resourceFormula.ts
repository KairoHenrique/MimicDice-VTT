import type { ResourceValue } from "./valueComponentViews";

/** Rounds away floating point noise (e.g. 7.499999) without forcing whole numbers. */
function tidy(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Next stored value of a bar whose maximum comes from a formula, or null when nothing changes.
 * A full bar stays full when the maximum changes (level up); otherwise the current value only shrinks to fit.
 */
export function syncedResource(stored: ResourceValue, computedMax: number | null, min: number | undefined): ResourceValue | null {
  if (computedMax === null) return null;
  const max = tidy(Math.max(computedMax, min ?? 0));
  if (max === stored.max) return null;
  const wasFull = stored.value >= stored.max;
  const value = wasFull ? max : Math.max(Math.min(stored.value, max), min ?? -Infinity);
  return { value, max };
}
