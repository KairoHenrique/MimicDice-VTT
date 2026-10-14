import { describe, expect, it } from "vitest";
import {
  clampTurns,
  effectsRollBonus,
  effectTurnsSchema,
  parseTurnsInput,
  afterOwnTurn,
  type AppliedEffect,
  effectIconSchema,
  formatDamage,
  hasActsLast,
  parseDamageInput,
  parseEffectDefinitions,
  searchEffectDefinitions,
  STARTER_EFFECT_DEFINITIONS,
  strongestVisionLimit,
  turnStartDamage,
  withAppliedEffect,
} from "./combatEffects.js";

function applied(definitionId: string, changes: Partial<AppliedEffect> = {}): AppliedEffect {
  const definition = STARTER_EFFECT_DEFINITIONS.find((entry) => entry.id === definitionId) ?? STARTER_EFFECT_DEFINITIONS[0]!;
  return { ...definition, id: `${definitionId}-1`, definitionId, turnsLeft: 2, ...changes };
}

describe("combat effects", () => {
  it("accepts Font Awesome icons and emoji, and nothing that could become markup", () => {
    expect(effectIconSchema.safeParse("fa-solid fa-skull").success).toBe(true);
    expect(effectIconSchema.safeParse("\u{1F9EA}").success).toBe(true);
    expect(effectIconSchema.safeParse("<b>x</b>").success).toBe(false);
    expect(effectIconSchema.safeParse("fa-solid fa-x\" onclick=\"y").success).toBe(false);
  });

  it("ships valid starter effects", () => {
    expect(parseEffectDefinitions(STARTER_EFFECT_DEFINITIONS)).toHaveLength(STARTER_EFFECT_DEFINITIONS.length);
  });

  it("adds up damage per resource at the start of the turn", () => {
    const damage = turnStartDamage([applied("envenenado"), applied("sangrando"), applied("tonto")]);
    expect(damage.get("vida")).toBe(3);
    expect(damage.size).toBe(1);
  });

  it("counts down one turn and drops the effects that ran out", () => {
    const left = afterOwnTurn([applied("envenenado", { turnsLeft: 1 }), applied("tonto", { turnsLeft: 3 })]);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ definitionId: "tonto", turnsLeft: 2 });
  });

  it("keeps the tightest vision limit and spots acting last", () => {
    expect(strongestVisionLimit([applied("cego"), applied("cego", { visionLimit: 0.5 })])).toBe(0.5);
    expect(strongestVisionLimit([applied("tonto")])).toBeNull();
    expect(hasActsLast([applied("envenenado"), applied("tonto")])).toBe(true);
  });

  it("refreshes an effect applied twice instead of stacking it", () => {
    const effects = withAppliedEffect([applied("envenenado", { turnsLeft: 1 })], applied("envenenado", { turnsLeft: 5 }));
    expect(effects).toEqual([expect.objectContaining({ turnsLeft: 5 })]);
  });

  it("reads damage typed as a number or as dice, and refuses anything else", () => {
    expect(parseDamageInput("3")).toEqual({ damagePerTurn: 3, damageDice: "" });
    expect(parseDamageInput(" 1d6 + 2 ")).toEqual({ damagePerTurn: 0, damageDice: "1d6+2" });
    expect(parseDamageInput("")).toEqual({ damagePerTurn: 0, damageDice: "" });
    expect(parseDamageInput("1d6+@forca")).toBeNull();
    expect(parseDamageInput("1d6*99")).toBeNull();
    expect(formatDamage({ damagePerTurn: 2, damageDice: "1d6" })).toBe("1d6+2");
    expect(parseEffectDefinitions([{ ...STARTER_EFFECT_DEFINITIONS[0], damageDice: "alert(1)" }])).toEqual([]);
  });

  it("adds each effect's dice result to its fixed damage", () => {
    const poison = applied("envenenado", { damagePerTurn: 2, damageDice: "1d6" });
    expect(turnStartDamage([poison], () => 4).get("vida")).toBe(6);
    expect(turnStartDamage([applied("envenenado", { damagePerTurn: 0, damageDice: "1d4" })], () => 3).get("vida")).toBe(3);
  });

  it("finds effects ignoring accents and case", () => {
    expect(searchEffectDefinitions(STARTER_EFFECT_DEFINITIONS, "COMEÇO").map((entry) => entry.id)).toEqual(["envenenado", "sangrando", "regenerando"]);
    expect(searchEffectDefinitions(STARTER_EFFECT_DEFINITIONS, "")).toHaveLength(STARTER_EFFECT_DEFINITIONS.length);
  });
});

describe("positive effects", () => {
  it("heals instead of hurting and adds roll bonuses", () => {
    const regen = applied("regenerando", { damagePerTurn: 0, damageDice: "1d4", heals: true });
    expect(turnStartDamage([regen], () => 3).get("vida")).toBe(-3);
    expect(effectsRollBonus([{ rollBonus: "1d4" }, { rollBonus: "-2" }, { rollBonus: "" }])).toBe(" + (1d4) + (-2)");
    expect(effectsRollBonus([{ rollBonus: "alert(1)" }])).toBe("");
  });
});

describe("effect duration", () => {
  it("accepts whole turns or dice, never negative dice or code", () => {
    expect(parseTurnsInput("3")).toBe(3);
    expect(parseTurnsInput("0")).toBe(1);
    expect(parseTurnsInput(" 1d4 + 1 ")).toBe("1d4+1");
    expect(parseTurnsInput("-1d4")).toBeNull();
    expect(parseTurnsInput("alert(1)")).toBeNull();
    expect(parseTurnsInput("")).toBeNull();
  });

  it("stores a number or a dice formula and keeps rolls in range", () => {
    expect(effectTurnsSchema.parse(3)).toBe(3);
    expect(effectTurnsSchema.parse("2d4")).toBe("2d4");
    expect(effectTurnsSchema.safeParse("2+2").success).toBe(false);
    expect(clampTurns(0)).toBe(1);
    expect(clampTurns(500)).toBe(99);
  });
});
