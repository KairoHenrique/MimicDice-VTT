import { describe, expect, it } from "vitest";
import { applyRollMode } from "./rollModes";

describe("applyRollMode", () => {
  it("keeps the formula as it is for a sum", () => {
    expect(applyRollMode("(@forca)d20 + 2", "sum")).toBe("(@forca)d20 + 2");
    expect(applyRollMode("2d6", undefined)).toBe("2d6");
  });

  it("keeps only the highest or lowest die of each dice term", () => {
    expect(applyRollMode("(@forca)d20", "highest")).toBe("(@forca)d20kh");
    expect(applyRollMode("3d6 + 1d4", "lowest")).toBe("3d6kl + 1d4kl");
  });

  it("leaves shortcuts that contain a d alone", () => {
    expect(applyRollMode("2d10 + @dano + @d2", "highest")).toBe("2d10kh + @dano + @d2");
    expect(applyRollMode("4d6kh3", "lowest")).toBe("4d6kh3");
  });
});
