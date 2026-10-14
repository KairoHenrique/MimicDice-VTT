import { evaluateSheetExpression } from "./computedValues";

const REFERENCE_PATTERN = /@[a-z0-9_.]+/gi;

/** `@refs` are unknown while editing, so they are checked as if they were 1. */
export function isValidRollFormula(formula: string): boolean {
  return formula.trim().length > 0 && Roll.validate(formula.replace(REFERENCE_PATTERN, "1"));
}

export function isValidComputedFormula(formula: string): boolean {
  return formula.trim().length > 0 && evaluateSheetExpression(formula.replace(REFERENCE_PATTERN, "1"), {}) !== null;
}
