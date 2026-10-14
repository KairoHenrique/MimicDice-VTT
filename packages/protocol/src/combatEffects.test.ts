import { describe, expect, it } from "vitest";
import {
  afterOwnTurn,
  type AppliedEffect,
  effectIconSchema,
  hasActsLast,
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

  it("finds effects ignoring accents and case", () => {
    expect(searchEffectDefinitions(STARTER_EFFECT_DEFINITIONS, "COMEÇO").map((entry) => entry.id)).toEqual(["envenenado", "sangrando"]);
    expect(searchEffectDefinitions(STARTER_EFFECT_DEFINITIONS, "")).toHaveLength(STARTER_EFFECT_DEFINITIONS.length);
  });
});
