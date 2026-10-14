import { describe, expect, it } from "vitest";
import { syncedResource } from "./resourceFormula";

describe("syncedResource", () => {
  it("does nothing when the formula is invalid or the maximum already matches", () => {
    expect(syncedResource({ value: 5, max: 10 }, null, 0)).toBeNull();
    expect(syncedResource({ value: 5, max: 10 }, 10, 0)).toBeNull();
  });

  it("keeps a full bar full when the maximum grows", () => {
    expect(syncedResource({ value: 16, max: 16 }, 32, 0)).toEqual({ value: 32, max: 32 });
  });

  it("keeps the current value of a damaged bar and shrinks it to fit", () => {
    expect(syncedResource({ value: 5, max: 16 }, 32, 0)).toEqual({ value: 5, max: 32 });
    expect(syncedResource({ value: 12, max: 16 }, 8, 0)).toEqual({ value: 8, max: 8 });
  });

  it("removes floating point noise and respects the minimum", () => {
    expect(syncedResource({ value: 0, max: 1 }, 7.499999999, 0)).toEqual({ value: 0, max: 7.5 });
    expect(syncedResource({ value: 3, max: 5 }, -4, 0)).toEqual({ value: 0, max: 0 });
  });
});
