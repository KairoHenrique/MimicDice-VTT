import { describe, expect, it } from "vitest";
import { formatDistance, measureMove, movedThisTurn, readTurnMovement } from "./turnMovementRules";

const squareGrid = { size: 100, distance: 1.5, gridless: false };

describe("measureMove", () => {
  it("counts diagonals as one square on a grid", () => {
    expect(measureMove({ x: 0, y: 0 }, { x: 300, y: 200 }, squareGrid)).toBe(4.5);
  });

  it("uses the straight line on gridless maps", () => {
    expect(measureMove({ x: 0, y: 0 }, { x: 300, y: 400 }, { size: 100, distance: 1, gridless: true })).toBe(5);
  });

  it("ignores a broken grid", () => {
    expect(measureMove({ x: 0, y: 0 }, { x: 300, y: 400 }, { size: 0, distance: 1, gridless: false })).toBe(0);
  });
});

describe("movedThisTurn", () => {
  const stored = { combatantId: "goblin", round: 2, distance: 6 };

  it("shows what the acting combatant walked this round", () => {
    expect(movedThisTurn(stored, "goblin", 2)).toBe(6);
  });

  it("starts from zero on a new turn or round", () => {
    expect(movedThisTurn(stored, "hero", 2)).toBe(0);
    expect(movedThisTurn(stored, "goblin", 3)).toBe(0);
    expect(movedThisTurn(null, "goblin", 2)).toBe(0);
  });

  it("rejects malformed stored values", () => {
    expect(readTurnMovement({ combatantId: "goblin", round: "2", distance: 6 })).toBeNull();
    expect(readTurnMovement({ combatantId: "goblin", round: 2, distance: -3 })).toEqual({ combatantId: "goblin", round: 2, distance: 0 });
  });
});

describe("formatDistance", () => {
  it("writes the distance in the scene units with the squares", () => {
    expect(formatDistance(4.5, "m", 1.5)).toBe("4,5 m (3 quadrados)");
    expect(formatDistance(1.5, "m", 1.5)).toBe("1,5 m (1 quadrado)");
  });
});
