import type { SheetComponent, SheetListColumn } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import { rollFromSheet } from "../rollFormulasSection";
import type { BoardContext } from "./boardContext";
import { emptyRow, MAX_LIST_ROWS, readListRows, type ListCell, type ListRow } from "./listRows";

function cellInput(column: SheetListColumn, value: ListCell | undefined, editable: boolean, onChange: (next: ListCell) => void): HTMLElement {
  const label = column.label;
  let input: HTMLInputElement;
  if (column.type === "checkbox") {
    input = h("input", { type: "checkbox", checked: value === true, disabled: !editable, "aria-label": label });
    input.addEventListener("change", () => onChange(input.checked));
  } else if (column.type === "number") {
    input = h("input", { type: "number", value: String(typeof value === "number" ? value : 0), step: "any", disabled: !editable, "aria-label": label });
    input.addEventListener("change", () => onChange(Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0));
  } else {
    input = h("input", { type: "text", value: String(value ?? ""), maxlength: 500, disabled: !editable, "aria-label": label });
    input.addEventListener("change", () => onChange(input.value.slice(0, 500)));
  }
  return h("td", {}, input);
}

/** Repeatable rows (inventory, spells, attacks); each row can roll the table formula with `@linha.<coluna>`. */
export function buildListControl(context: BoardContext, component: SheetComponent): HTMLElement | null {
  const key = component.key;
  const columns = component.columns ?? [];
  if (!key || columns.length === 0) return h("p", { class: "hint" }, "Tabela sem colunas.");
  const rows = readListRows(context.store.read(key), columns);
  const save = (next: ListRow[]) => void context.actor.update({ [context.store.pathOf(key)]: next });
  const formula = component.formula?.trim();

  const head = h("tr", {}, ...columns.map((column) => h("th", { scope: "col" }, column.label)), formula ? h("th", { "aria-label": "Rolar" }) : null, context.editable ? h("th", { "aria-label": "Remover" }) : null);
  const body = h("tbody", {});
  rows.forEach((row, rowIndex) => {
    const update = (columnKey: string) => (next: ListCell) => save(rows.map((entry, index) => (index === rowIndex ? { ...entry, [columnKey]: next } : entry)));
    const tr = h("tr", {}, ...columns.map((column) => cellInput(column, row[column.key], context.editable, update(column.key))));
    if (formula) {
      const roll = h("button", { type: "button", class: "md-roll", title: `Rolar ${formula}`, disabled: !context.actor.isOwner }, h("i", { class: "fa-solid fa-dice-d20" }));
      const rowName = String(row[columns[0].key] ?? component.label ?? "");
      roll.addEventListener("click", () => rollFromSheet(context.actor, formula, rowName, { ...context.extraRollData(), linha: row }));
      tr.append(h("td", { class: "md-list-action" }, roll));
    }
    if (context.editable) {
      const remove = h("button", { type: "button", class: "md-icon-button danger", title: "Remover linha" }, h("i", { class: "fa-solid fa-xmark" }));
      remove.addEventListener("click", () => save(rows.filter((_, index) => index !== rowIndex)));
      tr.append(h("td", { class: "md-list-action" }, remove));
    }
    body.append(tr);
  });

  const table = h("table", { class: "md-list" }, h("thead", {}, head), body);
  const wrapper = h("div", { class: "md-list-wrapper" }, table);
  if (rows.length === 0) wrapper.append(h("p", { class: "hint md-empty" }, "Nenhuma linha ainda."));
  if (context.editable && rows.length < MAX_LIST_ROWS) {
    const add = h("button", { type: "button", class: "md-list-add" }, h("i", { class: "fa-solid fa-plus" }), " Linha");
    add.addEventListener("click", () => save([...rows, emptyRow(columns)]));
    wrapper.append(add);
  }
  wrapper.addEventListener("change", (event) => event.stopPropagation());
  return wrapper;
}
