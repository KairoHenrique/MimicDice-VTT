import { beforeAll, describe, expect, it } from "vitest";
import { configureDice, Roll } from "./index";
import { safeEvalArithmetic } from "./safeEval";

describe("spreadsheet-style functions", () => {
  it("evaluates conditions as numbers", () => {
    expect(safeEvalArithmetic("if(1, 3, 5)")).toBe(3);
    expect(safeEvalArithmetic("if(0, 3, 5)")).toBe(5);
    expect(safeEvalArithmetic("if(gte(4, 3), 10, if(gt(4, 0), 5, 0))")).toBe(10);
    expect(safeEvalArithmetic("choose(2, 15, 11, 8)")).toBe(11);
    expect(safeEvalArithmetic("choose(9, 15, 11, 8)")).toBe(0);
    expect(safeEvalArithmetic("and(1, eq(2, 2)) + or(0, 0) + not(0)")).toBe(2);
  });
});

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

/** Uniform value that makes a die of `faces` land on `face` (inverse of ceil((1 - u) * faces)). */
function uniformFor(face: number, faces: number): number {
  return 1 - (face - 0.5) / faces;
}

beforeAll(() => {
  (globalThis as any).CONFIG = {};
  configureDice((globalThis as any).CONFIG);
});

function withFaces(faces: number, results: number[]): void {
  (globalThis as any).CONFIG.Dice.randomUniform = sequence(results.map((face) => uniformFor(face, faces)));
}

describe("safeEvalArithmetic", () => {
  it("respects precedence, unary minus and whitelisted functions", () => {
    expect(safeEvalArithmetic("2 + 3 * 4")).toBe(14);
    expect(safeEvalArithmetic("-(2) + - 3")).toBe(-5);
    expect(safeEvalArithmetic("floor(7 / 2) + max(1, 4, 2)")).toBe(7);
  });

  it("rejects anything that is not arithmetic", () => {
    expect(() => safeEvalArithmetic("alert(1)")).toThrow();
    expect(() => safeEvalArithmetic("constructor")).toThrow();
    expect(() => safeEvalArithmetic("1; 2")).toThrow();
  });
});

describe("Roll", () => {
  it("rolls dice with data substitution and flavor", async () => {
    withFaces(20, [15]);
    const roll = await new Roll("1d20 + @forca[bônus]", { forca: 3 }).evaluate();
    expect(roll.total).toBe(18);
    expect(roll.formula).toBe("1d20 + 3[bônus]");
    expect(roll.dice[0].results[0].result).toBe(15);
  });

  it("keeps the highest die (advantage)", async () => {
    withFaces(20, [4, 17]);
    const roll = await new Roll("2d20kh").evaluate();
    expect(roll.total).toBe(17);
    expect(roll.dice[0].results.find((result) => result.result === 4)?.discarded).toBe(true);
  });

  it("attribute 0 rolls two dice and keeps the lowest; otherwise keeps the highest", async () => {
    withFaces(20, [3, 18]);
    const atZero = await new Roll("if(eq(@agilidade, 0), 2d20kl, (@agilidade)d20kh) + @pericias.luta", { agilidade: 0, pericias: { luta: 2 } }).evaluate();
    expect(atZero.total).toBe(5);
    expect(atZero.dice).toHaveLength(1);
    expect(atZero.dice[0].results).toHaveLength(2);

    withFaces(20, [4, 17, 9]);
    const withPoints = await new Roll("if(eq(@agilidade, 0), 2d20kl, (@agilidade)d20kh) + @pericias.luta", { agilidade: 3, pericias: { luta: 1 } }).evaluate();
    expect(withPoints.total).toBe(18);
    expect(withPoints.dice).toHaveLength(1);
    expect(withPoints.dice[0].results).toHaveLength(3);
  });

  it("explodes, rerolls and counts successes", async () => {
    withFaces(6, [6, 2, 3]);
    expect((await new Roll("1d6x").evaluate()).total).toBe(8);
    withFaces(6, [1, 5]);
    expect((await new Roll("1d6r1").evaluate()).total).toBe(5);
    withFaces(10, [8, 3, 10]);
    expect((await new Roll("3d10cs>=8").evaluate()).total).toBe(2);
  });

  it("supports dynamic counts, pools and math functions", async () => {
    withFaces(6, [2, 4, 6]);
    expect((await new Roll("(1+2)d6").evaluate()).total).toBe(12);
    withFaces(8, [7, 1]);
    expect((await new Roll("{1d8, 1d8}kh").evaluate()).total).toBe(7);
    withFaces(6, [5]);
    expect((await new Roll("floor(1d6 / 2)").evaluate()).total).toBe(2);
  });

  it("evaluates deterministic formulas synchronously and refuses dice in strict mode", () => {
    expect(new Roll("2 * (3 + 4)").evaluateSync().total).toBe(14);
    expect(() => new Roll("1d6").evaluateSync()).toThrow();
  });

  it("round-trips through JSON without re-rolling", async () => {
    withFaces(12, [9]);
    const original = await new Roll("1d12 + 1").evaluate();
    const restored = Roll.fromJSON(JSON.stringify(original));
    expect(restored.total).toBe(10);
    expect(restored.dice[0].results[0].result).toBe(9);
    expect(restored.formula).toBe("1d12 + 1");
  });

  it("caps hostile formulas", async () => {
    expect(() => new Roll("1".repeat(3000))).toThrow();
    const huge = new Roll("99999d6");
    expect(huge.dice[0].number).toBeLessThanOrEqual(1000);
  });

  it("escapes formula text in the rendered card", async () => {
    const html = await new Roll("1d1[<img src=x onerror=alert(1)>]").render();
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
