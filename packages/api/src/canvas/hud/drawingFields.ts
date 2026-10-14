import type { PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import { currentGame } from "../../runtime";
import type { FormFieldSpec } from "./hudForms";

export const MAX_DRAWING_TEXT_LENGTH = 2000;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const EDITOR_FIELD_PREFIX = "editor-";
const DRAWING_COLOR_STORAGE_KEY = "mimicdice.drawingColor";

function colorOr(value: unknown, fallback: string): string {
  return typeof value === "string" && COLOR_PATTERN.test(value) ? value : fallback;
}

function readStoredDrawingColor(): string | null {
  try {
    return globalThis.localStorage?.getItem(DRAWING_COLOR_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The color picked in the drawing toolbar; until one is picked, the user's own color keeps whoever drew what readable. */
export function defaultDrawingColor(): string {
  return colorOr(readStoredDrawingColor(), colorOr(currentGame()?.user?.color, "#ffffff"));
}

export function setDrawingColor(color: string): boolean {
  if (!COLOR_PATTERN.test(color)) return false;
  try {
    globalThis.localStorage?.setItem(DRAWING_COLOR_STORAGE_KEY, color.toLowerCase());
  } catch {
    return true;
  }
  return true;
}

/** Texts recolor their letters; shapes recolor line and fill together. */
export function drawingColorPatch(source: PlainObject, color: string): PlainObject {
  const isText = (source.shape as PlainObject | undefined)?.type === CONST.DRAWING_TYPES.TEXT;
  return isText ? { textColor: color } : { strokeColor: color, fillColor: color };
}

export function textFields(source: PlainObject): FormFieldSpec[] {
  return [
    { name: "text", label: "Texto", type: "text", value: source.text ?? "", maxLength: MAX_DRAWING_TEXT_LENGTH },
    { name: "textColor", label: "Cor do texto", type: "color", value: colorOr(source.textColor, defaultDrawingColor()) },
    { name: "fontSize", label: "Tamanho da letra", type: "number", value: Number(source.fontSize) || 48, min: 8, max: 256, step: 1 },
  ];
}

export function shapeFields(source: PlainObject): FormFieldSpec[] {
  const filled = Number(source.fillType) !== CONST.DRAWING_FILL_TYPES.NONE;
  const fields: FormFieldSpec[] = [
    { name: "strokeColor", label: "Cor da linha", type: "color", value: colorOr(source.strokeColor, "#ffffff") },
    { name: "strokeWidth", label: "Espessura da linha", type: "number", value: Number(source.strokeWidth ?? 8), min: 1, max: 100, step: 1 },
  ];
  if (filled || (source.shape as PlainObject | undefined)?.type !== CONST.DRAWING_TYPES.POLYGON) {
    fields.push(
      { name: "fillColor", label: "Cor do preenchimento", type: "color", value: colorOr(source.fillColor, "#ffffff") },
      { name: "fillAlpha", label: "Opacidade do preenchimento (0 a 1)", type: "number", value: Number(source.fillAlpha ?? 0.25), min: 0, max: 1, step: 0.05 },
    );
  }
  return fields;
}

export function drawingEditFields(source: PlainObject): FormFieldSpec[] {
  const isText = (source.shape as PlainObject | undefined)?.type === CONST.DRAWING_TYPES.TEXT;
  return isText ? textFields(source) : shapeFields(source);
}

/** One checkbox per player: who besides the GM and the author may edit and move the drawing. */
export function editorFields(source: PlainObject): FormFieldSpec[] {
  const editors = Array.isArray(source.editors) ? (source.editors as string[]) : [];
  const players: any[] = (currentGame()?.users?.contents ?? []).filter((user: any) => !user.isGM && user.id !== source.author);
  return players.map((player) => ({ name: `${EDITOR_FIELD_PREFIX}${player.id}`, label: player.name, type: "checkbox", value: editors.includes(player.id) }));
}

export function readEditors(values: PlainObject): string[] {
  return Object.entries(values)
    .filter(([key, checked]) => key.startsWith(EDITOR_FIELD_PREFIX) && checked === true)
    .map(([key]) => key.slice(EDITOR_FIELD_PREFIX.length));
}
