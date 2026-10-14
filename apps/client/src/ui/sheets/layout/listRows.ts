import type { SheetListColumn } from "@tabbletop/protocol";

export const MAX_LIST_ROWS = 200;
export type ListCell = string | number | boolean;
export type ListRow = Record<string, ListCell>;

function isCell(value: unknown): value is ListCell {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

/** Some system data models prepare arrays as `{ "0": ..., "1": ... }`, so both shapes are accepted. */
function rowEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw === null || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const indexes = Object.keys(record).filter((key) => /^\d+$/.test(key));
  return indexes.sort((left, right) => Number(left) - Number(right)).map((index) => record[index]);
}

/** Rows come from actor data any owner can write, so only plain cells of known columns survive. */
export function readListRows(raw: unknown, columns: readonly SheetListColumn[]): ListRow[] {
  return rowEntries(raw).slice(0, MAX_LIST_ROWS).map((entry) => {
    const row: ListRow = {};
    const source = entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    for (const column of columns) {
      const cell = source[column.key];
      if (isCell(cell)) row[column.key] = cell;
    }
    return row;
  });
}

export function emptyRow(columns: readonly SheetListColumn[]): ListRow {
  return Object.fromEntries(columns.map((column) => [column.key, column.type === "number" ? 0 : column.type === "checkbox" ? false : ""]));
}
