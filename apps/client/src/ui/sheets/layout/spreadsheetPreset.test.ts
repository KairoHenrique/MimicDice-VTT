import { describe, expect, it } from "vitest";
import { sheetTemplateSchema } from "@tabbletop/protocol";
import { safeEvalArithmetic } from "@tabbletop/api/src/dice/safeEval";
import { computeDerivedValues } from "./computedValues";
import { formulaAliases } from "./formulaAliases";
import { allComponents, missingSystemData } from "./sheetLayoutRules";
import { spreadsheetPreset } from "./spreadsheetPreset";

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
  const template = spreadsheetPreset();
  const components = allComponents(template.layout);
  const values = { ...missingSystemData(template.layout, {}), ...overrides };
  const data = { ...values, ...formulaAliases(components, values) };
  const derived = computeDerivedValues(components, data, evaluate);
  const barMaximum = (key: string) => evaluate(components.find((component) => component.key === key)?.formula ?? "", { ...data, ...derived }) ?? Number.NaN;
  return { ...derived, pv_maximo: barMaximum("pv"), pe_maximo: barMaximum("pe") };
}

describe("Player sheet model", () => {
  it("is the default player model with valid formulas", () => {
    const template = spreadsheetPreset();
    expect(template.name).toBe("Player");
    expect(template.role).toBe("player");
    expect(sheetTemplateSchema.safeParse(template).success).toBe(true);
    for (const component of allComponents(template.layout)) {
      if (component.formula && (component.kind === "computed" || component.kind === "resource")) expect(evaluate(component.formula, {}), component.key).not.toBeNull();
    }
  });

  it("matches the Player spreadsheet for a new level 1 Brutamonte", () => {
    const derived = derivedFor();
    expect(derived.pontos_de_atributo).toBe(4);
    expect(derived.inventario_maximo).toBe(20);
    expect(derived.pv_maximo).toBe(16);
    expect(derived.pe_maximo).toBe(6);
    expect(derived.defesa).toBe(11);
    expect(derived.pontos_de_pericia).toBe(30);
    expect(derived.maximo_por_pericia).toBe(5);
    expect(derived.milagres_dano).toBe(1);
    expect(derived.milagres_dt).toBe(10);
    expect(derived.arcanismo_dt).toBe(15);
    expect(derived.magias_ocultas_dano).toBe(3);
    expect(derived.magias_ocultas_dt).toBe(13);
  });

  it("follows class, armor and level like the spreadsheet", () => {
    const sagaz = derivedFor({ classe: "Sagaz", nivel: 3, vigor: 2, pesada: true, reforcada: true, pericias: { reflexos: 2, fortitude: 1 } });
    expect(sagaz.pv_maximo).toBe((11 + 2) * 3);
    expect(sagaz.defesa).toBe(10 + 1 + 7 + 2);
    expect(sagaz.esquiva).toBe(sagaz.defesa + 7);
    expect(sagaz.bloqueio).toBe(1);
    expect(sagaz.rdm).toBe(5);
    expect(sagaz.inventario_maximo).toBe(10 + 2 + 4 + 8 - 8);
    expect(sagaz.maximo_por_pericia).toBe(10);
    expect(sagaz.pontos_de_pericia).toBe((6 + 1) * 5 - 3);
  });
});
