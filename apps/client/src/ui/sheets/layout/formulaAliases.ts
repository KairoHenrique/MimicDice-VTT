import type { SheetComponent } from "@tabbletop/protocol";
import { readSkillValues, skillPointsTotal } from "./skillList";

export const OPTION_INDEX_SUFFIX = "_n";
export const SKILLS_TOTAL_SUFFIX = "_total";

/**
 * Numbers formulas can read besides the stored values: a box counts 1 when ticked and 0 when not, `@chave_n` is the
 * position of the chosen option (1, 2, 3...; 0 for none) and `@chave_total` sums a skill list.
 */
export function formulaAliases(components: readonly SheetComponent[], values: Readonly<Record<string, unknown>>): Record<string, number> {
  const aliases: Record<string, number> = {};
  for (const component of components) {
    const key = component.key;
    if (!key) continue;
    if (component.kind === "checkbox") aliases[key] = values[key] === true ? 1 : 0;
    else if (component.kind === "select") aliases[`${key}${OPTION_INDEX_SUFFIX}`] = (component.options ?? []).indexOf(String(values[key] ?? "")) + 1;
    else if (component.kind === "skills") aliases[`${key}${SKILLS_TOTAL_SUFFIX}`] = skillPointsTotal(readSkillValues(values[key], component.skills ?? [], typeof component.initial === "number" ? component.initial : 0));
  }
  return aliases;
}
