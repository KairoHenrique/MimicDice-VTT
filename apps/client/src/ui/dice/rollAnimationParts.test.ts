import { describe, expect, it } from "vitest";
import { rollAnimationParts } from "./rollAnimationParts";

const die = (faces: number, ...values: Array<number | [number, boolean]>) => ({
  faces,
  results: values.map((value) => (Array.isArray(value) ? { result: value[0], active: value[1] } : { result: value, active: true })),
});
const plus = { operator: "+" };
const minus = { operator: "-" };
const number = (value: number) => ({ number: value });

describe("rollAnimationParts", () => {
  it("lists the dice and the fixed bonuses with their sign", () => {
    const parts = rollAnimationParts([{ terms: [{ ...die(20, 12), number: 1 }, plus, number(5), minus, number(1)] }], 16);
    expect(parts.dice.map((part) => part.result.result)).toEqual([12]);
    expect(parts.bonuses).toEqual(["+5", "−1"]);
  });

  it("dims dice of rolls the pool dropped", () => {
    const pool = { rolls: [{ terms: [die(20, 4)] }, { terms: [die(6, 6)] }], results: [{ result: 4, active: false }, { result: 6, active: true }] };
    const parts = rollAnimationParts([{ terms: [pool] }], 16);
    expect(parts.dice.map((part) => part.discarded)).toEqual([true, false]);
    expect(parts.bonuses).toEqual([]);
  });

  it("keeps a die's own discarded flag and respects the limit", () => {
    const parts = rollAnimationParts([{ terms: [die(20, [3, false], 17)] }], 1);
    expect(parts.dice).toHaveLength(1);
    expect(parts.dice[0]!.discarded).toBe(true);
  });
});
