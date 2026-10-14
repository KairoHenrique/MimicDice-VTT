import { clampNumber } from "../sheets/layout/sheetLayoutRules";
import type { ResourceReading } from "./statusReadings";

export interface ResourceEdit {
  value: number;
  max: number;
}

/** A bar without a maximum (0, never filled in) only stops at its minimum, so "0/0" sheets can still be changed. */
function upperLimit(reading: ResourceReading, max: number): number {
  return reading.kind === "bar" && max > reading.min ? max : Number.POSITIVE_INFINITY;
}

export function editedValue(reading: ResourceReading, typedValue: number): ResourceEdit {
  const value = clampNumber(Math.round(typedValue), reading.min, upperLimit(reading, reading.max));
  return { value, max: reading.max };
}

/** Lowering the maximum below the current value brings the value down with it. */
export function editedMax(reading: ResourceReading, typedMax: number): ResourceEdit {
  const max = Math.max(reading.min, Math.round(typedMax));
  return { value: clampNumber(reading.value, reading.min, upperLimit(reading, max)), max };
}

export function steppedValue(reading: ResourceReading, delta: number): ResourceEdit {
  return editedValue(reading, reading.value + delta);
}

export function resourceUpdate(reading: ResourceReading, edit: ResourceEdit): Record<string, unknown> {
  return reading.kind === "number" ? { [reading.path]: edit.value } : { [reading.path]: { value: edit.value, max: edit.max } };
}
