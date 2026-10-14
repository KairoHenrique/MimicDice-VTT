import { MAX_PIPS, type SheetComponent } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import { rollFromSheet } from "../sheetRoll";
import type { BoardContext } from "./boardContext";
import { formatDerived } from "./computedValues";
import { syncedResource } from "./resourceFormula";
import { clampNumber, rollFormulaFor } from "./sheetLayoutRules";

const DEFAULT_ACCENT = "#3b82f6";

export interface ResourceValue {
  value: number;
  max: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Older sheets may hold a plain number where the layout now expects `{ value, max }`. */
export function readResource(raw: unknown): ResourceValue {
  if (typeof raw === "number") return { value: raw, max: raw };
  const record = (raw ?? {}) as Partial<ResourceValue>;
  return { value: finiteOr(record.value, 0), max: finiteOr(record.max, 0) };
}

export function sheetRollButton(context: BoardContext, component: SheetComponent, formula: string, content: Node[]): HTMLButtonElement {
  const button = h("button", { type: "button", class: "md-roll", title: `Rolar ${formula}`, disabled: !context.actor.canEditSheet() }, ...content);
  button.addEventListener("click", () => rollFromSheet(context.actor, formula, component.label || "Rolagem", context.extraRollData(), component.rollMode));
  return button;
}

function numberControl(context: BoardContext, component: SheetComponent, key: string): HTMLElement {
  const input = h("input", {
    type: "number",
    name: context.store.pathOf(key),
    value: String(finiteOr(context.store.read(key), 0)),
    min: component.min,
    step: component.step ?? "any",
    disabled: !context.editable,
    "aria-label": component.label || key,
  });
  const formula = rollFormulaFor(component);
  const roll = formula ? sheetRollButton(context, component, formula, [h("i", { class: "fa-solid fa-dice-d20" })]) : null;
  return h("div", { class: "md-number" }, input, roll);
}

const pendingResourceSyncs = new Set<string>();

/** Writes the formula's maximum to the sheet once (other formulas and token bars read the stored value). */
function syncFormulaMaximum(context: BoardContext, component: SheetComponent, key: string, stored: ResourceValue): ResourceValue {
  if (!component.formula) return stored;
  const next = syncedResource(stored, context.evaluate(component.formula), component.min);
  if (!next) return stored;
  const path = context.store.pathOf(key);
  const syncId = `${context.actor.uuid}:${path}`;
  if (context.actor.canEditSheet?.() && !pendingResourceSyncs.has(syncId)) {
    pendingResourceSyncs.add(syncId);
    setTimeout(() => void Promise.resolve(context.actor.update({ [path]: next })).finally(() => pendingResourceSyncs.delete(syncId)), 0);
  }
  return next;
}

function resourceMaxField(component: SheetComponent, name: string, max: number, editable: boolean, label: string): HTMLElement {
  if (!component.formula) return h("input", { type: "number", name, value: String(max), disabled: !editable || !game.user.isGM, title: game.user.isGM ? "" : "Só o mestre muda o máximo", "aria-label": `${label} máximo` });
  return h("output", { class: "md-resource-max", title: `Calculado: ${component.formula}`, "aria-label": `${label} máximo (calculado)` }, formatDerived(max));
}

function resourceControl(context: BoardContext, component: SheetComponent, key: string): HTMLElement {
  const { actor, store, editable } = context;
  const { value, max } = syncFormulaMaximum(context, component, key, readResource(store.read(key)));
  const percent = max > 0 ? clampNumber((value / max) * 100, 0, 100) : 0;
  const accent = component.style?.accent ?? DEFAULT_ACCENT;
  const bar = h("div", { class: "md-bar", role: "progressbar", "aria-valuenow": value, "aria-valuemax": max }, h("div", { class: "md-bar-fill", style: `width:${percent}%;background:${accent}` }));
  const step = (delta: number) => () => void actor.update({ [store.pathOf(key)]: { value: clampNumber(value + delta, component.min ?? -Infinity, max), max } });
  const minus = h("button", { type: "button", class: "md-step", title: "Diminuir", disabled: !editable }, h("i", { class: "fa-solid fa-minus" }));
  const plus = h("button", { type: "button", class: "md-step", title: "Aumentar", disabled: !editable }, h("i", { class: "fa-solid fa-plus" }));
  minus.addEventListener("click", step(-1));
  plus.addEventListener("click", step(1));
  const label = component.label || key;
  const numbers = h(
    "div",
    { class: "md-resource-values" },
    minus,
    h("input", { type: "number", name: `${store.pathOf(key)}.value`, value: String(value), disabled: !editable, "aria-label": `${label} atual` }),
    h("span", { class: "md-separator" }, "/"),
    resourceMaxField(component, `${store.pathOf(key)}.max`, max, editable, label),
    plus,
  );
  return h("div", { class: "md-resource" }, bar, numbers);
}

function pipsControl(context: BoardContext, component: SheetComponent, key: string): HTMLElement {
  const total = context.limitFrom(component, component.max ?? 3, 1, MAX_PIPS);
  const filled = clampNumber(Math.round(finiteOr(context.store.read(key), 0)), 0, total);
  const accent = component.style?.accent;
  const pips = h("div", { class: "md-pips", role: "group", "aria-label": component.label || key });
  for (let index = 0; index < total; index++) {
    const isFilled = index < filled;
    const pip = h("button", { type: "button", class: `md-pip${isFilled ? " filled" : ""}`, "aria-pressed": String(isFilled), title: `${index + 1} de ${total}`, disabled: !context.editable, style: isFilled && accent ? `background:${accent};border-color:${accent}` : undefined });
    pip.addEventListener("click", () => void context.actor.update({ [context.store.pathOf(key)]: filled === index + 1 ? index : index + 1 }));
    pips.append(pip);
  }
  return pips;
}

function selectControl(context: BoardContext, component: SheetComponent, key: string): HTMLElement {
  const current = String(context.store.read(key) ?? "");
  const select = h("select", { name: context.store.pathOf(key), disabled: !context.editable, "aria-label": component.label || key });
  for (const option of component.options ?? []) select.append(h("option", { value: option, selected: option === current }, option));
  return select;
}

/** Control for a value component; named inputs post through the sheet form, pips and steppers update directly. */
export function buildValueControl(context: BoardContext, component: SheetComponent): HTMLElement | null {
  const key = component.key;
  if (!key) return null;
  const name = context.store.pathOf(key);
  const value = context.store.read(key);
  const label = component.label || key;
  switch (component.kind) {
    case "number":
      return numberControl(context, component, key);
    case "resource":
      return resourceControl(context, component, key);
    case "pips":
      return pipsControl(context, component, key);
    case "checkbox":
      return h("label", { class: "md-check" }, h("input", { type: "checkbox", name, checked: value === true, disabled: !context.editable, "aria-label": label }), component.style?.hideLabel ? null : h("span", {}, label));
    case "select":
      return selectControl(context, component, key);
    case "longtext":
      return h("textarea", { name, maxlength: 20000, disabled: !context.editable, "aria-label": label, placeholder: component.hint ?? "" }, String(value ?? ""));
    case "text":
      return h("input", { type: "text", name, value: String(value ?? ""), maxlength: 2000, disabled: !context.editable, "aria-label": label, placeholder: component.hint ?? "" });
    default:
      return null;
  }
}
