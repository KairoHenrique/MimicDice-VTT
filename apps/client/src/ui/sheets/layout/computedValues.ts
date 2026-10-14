import type { SheetComponent } from "@tabbletop/protocol";

export type ExpressionEvaluator = (formula: string, data: Record<string, unknown>) => number | null;

const DERIVATION_PASSES = 3;

/** Dice-free arithmetic over `@refs`; anything invalid (dice, unknown functions) yields null instead of throwing. */
export const evaluateSheetExpression: ExpressionEvaluator = (formula, data) => {
  try {
    const expression = Roll.replaceFormulaData(formula, data, { missing: "0" });
    const value = Roll.safeEval(expression);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * Values of every "Cálculo" component with a key. A few passes let one calculation use another
 * (e.g. @mod_forca inside @ataque) regardless of where they sit on the sheet.
 */
export function computeDerivedValues(components: readonly SheetComponent[], baseData: Record<string, unknown>, evaluate: ExpressionEvaluator = evaluateSheetExpression): Record<string, number> {
  const formulas = components.filter((component) => component.kind === "computed" && component.key && component.formula);
  const derived: Record<string, number> = {};
  for (let pass = 0; pass < DERIVATION_PASSES; pass++) {
    for (const component of formulas) {
      const value = evaluate(component.formula as string, { ...baseData, ...derived });
      if (value !== null) derived[component.key as string] = value;
    }
  }
  return derived;
}

export function formatDerived(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
