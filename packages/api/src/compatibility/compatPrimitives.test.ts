import { describe, expect, it } from "vitest";
import { Ray } from "../canvas/geometryClasses";
import { ForcedDeletion, ForcedReplacement, serializeUpdateOperators } from "../data/operators";
import { BitMask } from "../utils/BitMask";
import { Color } from "../utils/Color";
import { getRoute } from "../utils/routes";
import { installPrimitiveExtensions } from "../utils/primitives";

describe("Set extensions", () => {
  installPrimitiveExtensions();
  const numbers = new Set([1, 2, 3, 4]) as Set<number> & Record<string, any>;

  it("filters into a Set and maps into an Array, like Foundry", () => {
    const evens = numbers.filter((value: number) => value % 2 === 0);
    expect(evens).toBeInstanceOf(Set);
    expect([...evens]).toEqual([2, 4]);
    expect(numbers.map((value: number) => value * 10)).toEqual([10, 20, 30, 40]);
  });

  it("supports find, some, every, reduce and intersects", () => {
    expect(numbers.find((value: number) => value > 2)).toBe(3);
    expect(numbers.some((value: number) => value > 3)).toBe(true);
    expect(numbers.every((value: number) => value > 1)).toBe(false);
    expect(numbers.reduce((sum: number, value: number) => sum + value, 0)).toBe(10);
    expect(numbers.intersects(new Set([9, 4]))).toBe(true);
  });
});

describe("BitMask", () => {
  it("tracks named states as bits", () => {
    const mask = new BitMask({ tiling: false, vision: true, color: false });
    expect(mask.hasState("vision")).toBe(true);
    mask.toggleState("tiling", true);
    mask.removeState("vision");
    expect(mask.states).toEqual({ tiling: true, vision: false, color: false });
    expect(mask.valueOf()).toBe(1);
    expect(() => mask.hasState("missing")).toThrow();
  });

  it("generates matching GLSL constants", () => {
    expect(BitMask.generateShaderBitMaskConstants(["IS_TILING", "IS_VISION"])).toBe("const uint IS_TILING = 0x1U;\nconst uint IS_VISION = 0x2U;");
  });
});

describe("Ray", () => {
  it("computes distance, angle and projections", () => {
    const ray = new Ray({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(ray.distance).toBe(5);
    expect(ray.project(0.5)).toEqual({ x: 1.5, y: 2 });
    const towards = Ray.towardsPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(towards.B.x).toBeCloseTo(2);
    expect(towards.B.y).toBeCloseTo(0);
  });
});

describe("update operators", () => {
  it("converts ForcedDeletion to legacy deletion keys and unwraps replacements", () => {
    const serialized = serializeUpdateOperators({ "flags.sequencer.effect": new ForcedDeletion(), system: { stats: new ForcedReplacement({ hp: 3 }), old: new ForcedDeletion() } });
    expect(serialized).toEqual({ "flags.sequencer.-=effect": null, system: { stats: { hp: 3 }, "-=old": null } });
  });
});

describe("Color", () => {
  it("parses, converts and mixes colors", () => {
    const orange = Color.from("#ff8000");
    expect(orange.valueOf()).toBe(0xff8000);
    expect(orange.css).toBe("#ff8000");
    expect(orange.rgb[0]).toBe(1);
    expect(Color.from("#fff").valueOf()).toBe(0xffffff);
    expect(Color.from("nope").valid).toBe(false);
    expect(Color.mix("#000000", "#ffffff").css).toBe("#808080");
    expect(orange.multiply(0).css).toBe("#000000");
  });
});

describe("getRoute", () => {
  it("joins paths from the server root", () => {
    expect(getRoute("modules/x/a.png")).toBe("/modules/x/a.png");
    expect(getRoute("/game", { prefix: "vtt/" })).toBe("/vtt/game");
  });
});
