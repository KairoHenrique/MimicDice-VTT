import type { SheetRollMode } from "@tabbletop/protocol";

const DICE_TERM_PATTERN = /(?<![A-Za-z_@])d(\d+)(?![A-Za-z0-9])/g;

/** "Só o maior/menor dado": every dice term keeps only its highest (kh) or lowest (kl) die. */
export function applyRollMode(formula: string, mode: SheetRollMode | undefined): string {
  if (!mode || mode === "sum") return formula;
  return formula.replace(DICE_TERM_PATTERN, `d$1${mode === "highest" ? "kh" : "kl"}`);
}
