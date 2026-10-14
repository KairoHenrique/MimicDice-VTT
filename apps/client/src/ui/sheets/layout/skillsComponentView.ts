import { MAX_PIPS, MAX_SKILL_COLUMNS, MAX_SKILL_POINTS, type SheetComponent, type SheetSkill } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import { rollFromSheet } from "../sheetRoll";
import type { BoardContext } from "./boardContext";
import { clampNumber } from "./sheetLayoutRules";
import { readSkillValues, skillPointsTotal } from "./skillList";

interface SkillRowContext {
  readonly context: BoardContext;
  readonly component: SheetComponent;
  readonly path: string;
  readonly formula: string | null;
}

function skillName(row: SkillRowContext, skill: SheetSkill, value: number): HTMLElement {
  if (!row.formula) return h("span", { class: "md-skill-name", title: skill.label }, skill.label);
  const formula = row.formula;
  const button = h("button", { type: "button", class: "md-skill-name md-skill-roll", title: `Rolar ${skill.label}: ${formula}`, disabled: !row.context.actor.canEditSheet() }, h("i", { class: "fa-solid fa-dice-d20", "aria-hidden": "true" }), ` ${skill.label}`);
  button.addEventListener("click", () => rollFromSheet(row.context.actor, formula, skill.label, { ...row.context.extraRollData(), valor: value }, row.component.rollMode));
  return button;
}

function numberValue(row: SkillRowContext, skill: SheetSkill, value: number): HTMLElement {
  const minimum = row.component.min;
  const input = h("input", { type: "number", class: "md-skill-value", value: String(value), step: "1", min: minimum !== undefined ? String(minimum) : undefined, disabled: !row.context.editable, "aria-label": skill.label });
  input.addEventListener("change", () => {
    const next = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
    void row.context.actor.update({ [`${row.path}.${skill.key}`]: minimum !== undefined ? Math.max(minimum, next) : next });
  });
  return input;
}

function pipsValue(row: SkillRowContext, skill: SheetSkill, value: number): HTMLElement {
  const total = clampNumber(row.component.max ?? 3, 1, MAX_PIPS);
  const filled = clampNumber(Math.round(value), 0, total);
  const pips = h("div", { class: "md-pips md-skill-value", role: "group", "aria-label": skill.label });
  for (let index = 0; index < total; index++) {
    const isFilled = index < filled;
    const pip = h("button", { type: "button", class: `md-pip${isFilled ? " filled" : ""}`, "aria-pressed": String(isFilled), title: `${skill.label}: ${index + 1} de ${total}`, disabled: !row.context.editable });
    pip.addEventListener("click", () => void row.context.actor.update({ [`${row.path}.${skill.key}`]: filled === index + 1 ? index : index + 1 }));
    pips.append(pip);
  }
  return pips;
}

function header(context: BoardContext, component: SheetComponent, total: number): HTMLElement {
  const limit = context.limitFrom(component, component.pointsMax ?? 0, 0, MAX_SKILL_POINTS);
  const over = limit > 0 && total > limit;
  const title = component.style?.hideLabel ? "" : `${component.label || "Perícias"}: `;
  return h(
    "div",
    { class: `md-skills-header${over ? " over" : ""}`, title: over ? "Passou do máximo de pontos" : "" },
    h("span", {}, `${title}${total}`),
    limit ? h("span", { class: "md-skills-limit" }, `máx: ${limit}`) : null,
  );
}

/** Skill list in the style of a printed sheet: a header with the points spent and one row per skill. */
export function buildSkillsControl(context: BoardContext, component: SheetComponent): HTMLElement {
  const key = component.key;
  const skills = component.skills ?? [];
  if (!key || skills.length === 0) return h("p", { class: "hint" }, "Nenhuma perícia. Adicione os nomes no editor da ficha.");
  const values = readSkillValues(context.store.read(key), skills, typeof component.initial === "number" ? component.initial : 0);
  const row: SkillRowContext = { context, component, path: context.store.pathOf(key), formula: component.formula?.trim() || null };
  const columns = clampNumber(component.skillColumns ?? 1, 1, MAX_SKILL_COLUMNS);
  const list = h("ul", { class: "md-skills-list", style: `--md-skill-columns:${columns}`, role: "list" });
  for (const skill of skills) {
    const value = values[skill.key] ?? 0;
    const control = component.skillStyle === "pips" ? pipsValue(row, skill, value) : numberValue(row, skill, value);
    list.append(h("li", { class: "md-skill" }, skillName(row, skill, value), control));
  }
  const wrapper = h("div", { class: "md-skills" }, header(context, component, skillPointsTotal(values)), list);
  wrapper.addEventListener("change", (event) => event.stopPropagation());
  return wrapper;
}
