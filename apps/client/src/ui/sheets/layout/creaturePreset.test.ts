import { describe, expect, it } from "vitest";
import { sheetTemplateSchema } from "@tabbletop/protocol";
import { safeEvalArithmetic } from "@tabbletop/api/src/dice/safeEval";
import { computeDerivedValues } from "./computedValues";
import { creatureEnemyPreset, creatureNpcPreset } from "./creaturePreset";
import { formulaAliases } from "./formulaAliases";
import { allComponents, missingSystemData } from "./sheetLayoutRules";

function readPath(data: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => (value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined), data);
}

const evaluate = (formula: string, data: Record<string, unknown>): number | null => {
  try {
    const expression = formula.replace(/@([a-z.0-9_-]+)/gi, (_, path: string) => {
      const value = readPath(data, path);
      return typeof value === "number" ? String(value) : "0";
    });
    return safeEvalArithmetic(expression);
  } catch {
    return null;
  }
};

function derivedFor(overrides: Record<string, unknown> = {}): Record<string, number> {
  const template = creatureNpcPreset();
  const components = allComponents(template.layout);
  const values = { ...missingSystemData(template.layout, {}), ...overrides };
  const data = { ...values, ...formulaAliases(components, values) };
  const derived = computeDerivedValues(components, data, evaluate);
  const barMaximum = (key: string) => evaluate(components.find((component) => component.key === key)?.formula ?? "", { ...data, ...derived }) ?? Number.NaN;
  return { ...derived, pv_maximo: barMaximum("pv") };
}

describe("NPC / Inimigo sheet model", () => {
  it("ships matching default NPC and enemy models", () => {
    const npc = creatureNpcPreset();
    const enemy = creatureEnemyPreset();
    expect(npc.name).toBe("NPC");
    expect(enemy.name).toBe("Inimigo");
    expect(sheetTemplateSchema.safeParse(npc).success).toBe(true);
    expect(sheetTemplateSchema.safeParse(enemy).success).toBe(true);
    expect(npc.layout).toEqual(enemy.layout);
    for (const component of allComponents(npc.layout)) {
      if (component.formula && (component.kind === "computed" || component.kind === "resource")) {
        expect(evaluate(component.formula, {}), component.key).not.toBeNull();
      }
    }
    const agility = allComponents(npc.layout).find((component) => component.key === "agilidade");
    expect(agility?.formula).toContain("2d20kl");
    expect(agility?.formula).toContain("d20kh");
  });

  it("matches the creature spreadsheet for a new level 1 creature", () => {
    const derived = derivedFor();
    expect(derived.pv_maximo).toBe(8);
    expect(derived.machucado).toBe(4);
    expect(derived.defesa).toBe(11);
    expect(derived.pontos_de_pericia).toBe(15);
    expect(derived.bloqueio).toBe(0);
    expect(derived.esquiva).toBe(0);
  });

  it("scales PV, machucado and defense with vigor, level and skills", () => {
    const mid = derivedFor({
      nivel: 3,
      vigor: 2,
      intelecto: 2,
      defesa_bonus: 1,
      pericias: { luta: 5, reflexos: 2, fortitude: 4 },
    });
    expect(mid.pv_maximo).toBe((7 + 2) * 3);
    expect(mid.machucado).toBe(Math.floor(((7 + 2) * 3) / 2));
    expect(mid.defesa).toBe(10 + 2 + 1);
    expect(mid.bloqueio).toBe(4);
    expect(mid.esquiva).toBe(mid.defesa);
    expect(mid.pontos_de_pericia).toBe(15 - 11);
  });
});
