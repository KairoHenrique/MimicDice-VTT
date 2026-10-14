import { h } from "../../views/dom";
import { rollFromSheet } from "./rollFormulasSection";

const CUSTOM_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,40}(\.[A-Za-z][A-Za-z0-9_]{0,40}){0,3}$/;
const MAX_FIELDS_SHOWN = 400;

type FieldKind = "number" | "boolean" | "text" | "json";

function kindOf(value: unknown): FieldKind {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" || value === null) return "text";
  return "json";
}

function flattenLeaves(source: Record<string, unknown>, prefix = "", leaves: Array<[string, unknown]> = []): Array<[string, unknown]> {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const isPlainObject = value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
    if (isPlainObject) flattenLeaves(value as Record<string, unknown>, path, leaves);
    else leaves.push([path, value]);
    if (leaves.length >= MAX_FIELDS_SHOWN) break;
  }
  return leaves;
}

function inputFor(path: string, value: unknown, editable: boolean): HTMLElement {
  const name = `system.${path}`;
  switch (kindOf(value)) {
    case "number":
      return h("input", { type: "number", name, value: String(value), step: "any", disabled: !editable });
    case "boolean":
      return h("input", { type: "checkbox", name, checked: value === true, disabled: !editable });
    case "text":
      return h("input", { type: "text", name, value: String(value ?? ""), disabled: !editable });
    default:
      return h("textarea", { name, "data-dtype": "JSON", rows: 2, disabled: !editable }, JSON.stringify(value));
  }
}

function parseCustomValue(kind: string, rawValue: string): unknown {
  if (kind === "number") return Number(rawValue) || 0;
  if (kind === "boolean") return rawValue === "true" || rawValue === "sim";
  return rawValue;
}

function isTemplateField(document: any, path: string): boolean {
  const template = game.model?.[document.documentName]?.[document.type];
  let cursor: any = template;
  for (const part of path.split(".")) {
    if (cursor === null || typeof cursor !== "object" || !(part in cursor)) return false;
    cursor = cursor[part];
  }
  return true;
}

function removalKeyFor(path: string): string {
  const parts = path.split(".");
  const last = parts.pop() as string;
  return ["system", ...parts, `-=${last}`].join(".");
}

/** Editor for `system` data: shows every leaf field and, for free-form sheets, lets owners add and remove fields. */
export function buildSystemFieldsEditor(document: any, editable: boolean): HTMLElement {
  const usesDataModel = typeof document.system?.toObject === "function";
  const systemSource = (document._source.system ?? {}) as Record<string, unknown>;
  const list = h("div", { class: "system-fields" });
  const canRoll = document.isOwner && document.documentName === "Actor";
  for (const [path, value] of flattenLeaves(systemSource)) {
    const row = h("div", { class: "form-group system-field" }, h("label", {}, path), inputFor(path, value, editable));
    if (canRoll && typeof value === "number") {
      const rollButton = h("button", { type: "button", class: "icon attribute-roll", title: `Rolar 1d20 + ${path}` }, h("i", { class: "fa-solid fa-dice-d20" }));
      rollButton.addEventListener("click", () => rollFromSheet(document, `1d20 + @${path}`, path));
      row.append(rollButton);
    }
    if (editable && !usesDataModel && !isTemplateField(document, path)) {
      const remove = h("button", { type: "button", class: "icon", title: `Remover ${path}` }, h("i", { class: "fa-solid fa-xmark" }));
      remove.addEventListener("click", () => void document.update({ [removalKeyFor(path)]: null }));
      row.append(remove);
    }
    list.append(row);
  }
  if (list.childElementCount === 0) list.append(h("p", { class: "hint" }, "Ficha vazia. Adicione campos como Vida, Força ou Classe."));
  if (editable && !usesDataModel) list.append(buildCustomFieldForm(document));
  return h("fieldset", { class: "system-section" }, h("legend", {}, "Atributos"), list);
}

function buildCustomFieldForm(document: any): HTMLElement {
  const keyInput = h("input", { type: "text", placeholder: "nome (ex.: vida.atual)", maxlength: 120, "data-ignore": "true" });
  const kindSelect = h("select", { "data-ignore": "true" }, h("option", { value: "number" }, "Número"), h("option", { value: "text" }, "Texto"), h("option", { value: "boolean" }, "Sim/Não"));
  const valueInput = h("input", { type: "text", placeholder: "valor", maxlength: 2000, "data-ignore": "true" });
  const addButton = h("button", { type: "button" }, h("i", { class: "fa-solid fa-plus" }), " Campo");
  addButton.addEventListener("click", () => {
    const key = keyInput.value.trim();
    if (!CUSTOM_FIELD_PATTERN.test(key)) {
      ui.notifications.warn("Use letras, números e _ (subníveis com ponto, ex.: vida.atual).");
      return;
    }
    void document.update({ [`system.${key}`]: parseCustomValue(kindSelect.value, valueInput.value) });
  });
  return h("div", { class: "form-group custom-field" }, keyInput, kindSelect, valueInput, addButton);
}
