import { SHEET_GRID_COLUMNS, type LegacySheetField, type LegacySheetLayout, type SheetComponent, type SheetLayout } from "@tabbletop/protocol";

const MAIN_PAGE_ID = "main";

function fieldHeight(field: LegacySheetField): number {
  if (field.type === "longtext") return 4;
  if (field.type === "checkbox") return 1;
  return 2;
}

function fieldToComponent(field: LegacySheetField, x: number, y: number, w: number): SheetComponent {
  const base = { id: field.id, x, y, w, h: fieldHeight(field), label: field.label, hint: field.hint };
  const accent = field.color ? { style: { accent: field.color } } : {};
  if (field.type === "roll") return { ...base, kind: "roll", formula: field.formula, ...accent };
  return {
    ...base,
    kind: field.type,
    key: field.key,
    formula: field.formula,
    options: field.options,
    max: field.max,
    initial: field.initial,
    rollable: field.type === "number" && Boolean(field.formula) ? true : undefined,
    ...accent,
  };
}

/**
 * Version 1 stacked sections with 1-3 columns; each becomes a full-width title followed by its fields
 * laid out row by row on the 12-column grid, so old sheets look the same after the upgrade.
 */
export function migrateLegacyLayout(legacy: LegacySheetLayout): SheetLayout {
  const components: SheetComponent[] = [];
  let cursorRow = 0;
  for (const section of legacy.sections) {
    components.push({ id: `${section.id}t`.slice(0, 24), kind: "title", x: 0, y: cursorRow, w: SHEET_GRID_COLUMNS, h: 1, content: section.title });
    cursorRow += 1;
    const width = Math.floor(SHEET_GRID_COLUMNS / section.columns);
    let rowHeight = 0;
    section.fields.forEach((field, index) => {
      const column = index % section.columns;
      if (column === 0 && index > 0) {
        cursorRow += rowHeight;
        rowHeight = 0;
      }
      const component = fieldToComponent(field, column * width, cursorRow, width);
      rowHeight = Math.max(rowHeight, component.h);
      components.push(component);
    });
    cursorRow += rowHeight + 1;
  }
  return { version: 2, pages: [{ id: MAIN_PAGE_ID, title: "Ficha", components }] };
}
