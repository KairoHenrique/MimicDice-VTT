import { MAX_LIST_COLUMNS, SHEET_LIST_COLUMN_TYPES, type SheetListColumn } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import { keyFromLabel } from "../sheetLayoutRules";

const COLUMN_TYPE_LABELS: Readonly<Record<SheetListColumn["type"], string>> = { text: "Texto", number: "Número", checkbox: "Caixa" };

/** Column list of a table component; keys follow the labels so `@linha.<chave>` stays readable. */
export function buildListColumnsEditor(columns: readonly SheetListColumn[], onChange: (columns: SheetListColumn[]) => void): HTMLElement {
  const container = h("div", { class: "md-insp-columns" });
  columns.forEach((column, index) => {
    const label = h("input", { type: "text", value: column.label, maxlength: 60, "aria-label": `Nome da coluna ${index + 1}` });
    label.dataset.focusKey = `column-label:${index}`;
    label.addEventListener("change", () => {
      const text = label.value.trim();
      if (!text) return;
      const otherKeys = new Set(columns.filter((_, other) => other !== index).map((entry) => entry.key));
      onChange(columns.map((entry, other) => (other === index ? { ...entry, label: text.slice(0, 60), key: keyFromLabel(text, otherKeys) } : entry)));
    });
    const type = h("select", { "aria-label": `Tipo da coluna ${index + 1}` });
    for (const option of SHEET_LIST_COLUMN_TYPES) type.append(h("option", { value: option, selected: option === column.type }, COLUMN_TYPE_LABELS[option]));
    type.addEventListener("change", () => onChange(columns.map((entry, other) => (other === index ? { ...entry, type: type.value as SheetListColumn["type"] } : entry))));
    const remove = h("button", { type: "button", class: "md-icon-button danger", title: "Remover coluna", disabled: columns.length <= 1 }, h("i", { class: "fa-solid fa-xmark" }));
    remove.addEventListener("click", () => onChange(columns.filter((_, other) => other !== index)));
    container.append(h("div", { class: "md-insp-column" }, label, type, h("code", { class: "hint" }, `@linha.${column.key}`), remove));
  });
  if (columns.length < MAX_LIST_COLUMNS) {
    const add = h("button", { type: "button", class: "md-list-add" }, h("i", { class: "fa-solid fa-plus" }), " Coluna");
    add.addEventListener("click", () => {
      const key = keyFromLabel(`Coluna ${columns.length + 1}`, new Set(columns.map((entry) => entry.key)));
      onChange([...columns, { key, label: `Coluna ${columns.length + 1}`, type: "text" }]);
    });
    container.append(add);
  }
  return container;
}
