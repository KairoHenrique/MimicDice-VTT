import { describe, expect, it } from "vitest";
import { DicePool, MAX_POOLED_DICE } from "./DicePool";
import { combinePoolWithInput, parseRollCommand } from "./rollCommands";

describe("DicePool", () => {
  it("accumulates dice per face and builds one formula, largest dice first", () => {
    const pool = new DicePool();
    pool.add(6);
    pool.add(20);
    pool.add(6);
    expect(pool.countOf(6)).toBe(2);
    expect(pool.total).toBe(3);
    expect(pool.toFormula()).toBe("1d20 + 2d6");
    pool.remove(6);
    pool.remove(20);
    expect(pool.toFormula()).toBe("1d6");
  });

  it("refuses dice beyond the limit", () => {
    const pool = new DicePool();
    for (let index = 0; index < MAX_POOLED_DICE; index++) expect(pool.add(4)).toBe(true);
    expect(pool.add(8)).toBe(false);
    expect(pool.total).toBe(MAX_POOLED_DICE);
    pool.clear();
    expect(pool.isEmpty).toBe(true);
  });
});

describe("combinePoolWithInput", () => {
  it("adds typed modifiers and keeps roll commands and flavor", () => {
    expect(combinePoolWithInput("2d6", "")).toBe("2d6");
    expect(combinePoolWithInput("2d6", "5")).toBe("2d6 + 5");
    expect(combinePoolWithInput("2d6", "- 1")).toBe("2d6 - 1");
    expect(combinePoolWithInput("1d20", "/gmr 3 # Furtividade")).toBe("/gmr 1d20 + 3 # Furtividade");
    expect(combinePoolWithInput("", "1d8")).toBe("1d8");
    expect(parseRollCommand(combinePoolWithInput("1d20", "/gmr # Furtividade"))).toEqual({ formula: "1d20", rollMode: "gmroll", flavor: "Furtividade" });
  });
});
