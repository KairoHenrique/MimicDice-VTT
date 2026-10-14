import { expandObject, getProperty, type PlainObject } from "@tabbletop/common";
import { FilePicker } from "../../applications/apps/FilePicker";

export interface FormFieldSpec {
  name: string;
  label: string;
  type: "text" | "number" | "checkbox" | "color" | "select" | "image";
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  choices?: Array<{ value: string; label: string }>;
  /** Text fields only: values offered while typing; anything else may still be entered. */
  suggestions?: string[];
}

let datalistSequence = 0;

function suggestionList(input: HTMLInputElement, suggestions: string[]): HTMLDataListElement {
  const datalist = document.createElement("datalist");
  datalist.id = `canvas-hud-suggestions-${++datalistSequence}`;
  for (const suggestion of suggestions) {
    const option = document.createElement("option");
    option.value = suggestion;
    datalist.append(option);
  }
  input.setAttribute("list", datalist.id);
  return datalist;
}

const DEFAULT_MAX_TEXT = 500;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function buildInput(field: FormFieldSpec): HTMLInputElement | HTMLSelectElement {
  if (field.type === "select") {
    const select = document.createElement("select");
    for (const choice of field.choices ?? []) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      option.selected = choice.value === String(field.value ?? "");
      select.append(option);
    }
    return select;
  }
  const input = document.createElement("input");
  input.type = field.type === "image" ? "text" : field.type;
  if (field.type === "checkbox") input.checked = field.value === true;
  else input.value = String(field.value ?? "");
  if (field.min !== undefined) input.min = String(field.min);
  if (field.max !== undefined) input.max = String(field.max);
  if (field.step !== undefined) input.step = String(field.step);
  if (field.type === "text" || field.type === "image") input.maxLength = field.maxLength ?? DEFAULT_MAX_TEXT;
  return input;
}

function browseButton(input: HTMLInputElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fa-solid fa-file-import";
  button.title = "Procurar ou enviar imagem";
  button.addEventListener("click", () => {
    void new FilePicker.implementation({ type: "image", current: input.value, field: input }).render({ force: true });
  });
  return button;
}

export function buildForm(fields: FormFieldSpec[]): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "canvas-hud-form";
  form.addEventListener("submit", (event) => event.preventDefault());
  for (const field of fields) {
    const group = document.createElement("label");
    group.className = "form-group";
    const caption = document.createElement("span");
    caption.textContent = field.label;
    const input = buildInput(field);
    input.name = field.name;
    group.append(caption, input);
    if (field.type === "image") {
      group.classList.add("image-field");
      group.append(browseButton(input as HTMLInputElement));
    }
    if (field.type === "text" && field.suggestions?.length) group.append(suggestionList(input as HTMLInputElement, field.suggestions));
    form.append(group);
  }
  return form;
}

function coerce(field: FormFieldSpec, element: HTMLInputElement | HTMLSelectElement): unknown {
  if (field.type === "checkbox") return (element as HTMLInputElement).checked;
  if (field.type === "number") {
    const numeric = Number(element.value);
    if (!Number.isFinite(numeric)) return field.value;
    return Math.min(Math.max(numeric, field.min ?? -Infinity), field.max ?? Infinity);
  }
  if (field.type === "color") return COLOR_PATTERN.test(element.value) ? element.value : field.value;
  if (field.type === "select") return (field.choices ?? []).some((choice) => choice.value === element.value) ? element.value : field.value;
  return element.value.slice(0, field.maxLength ?? DEFAULT_MAX_TEXT);
}

/**
 * Shows the listed fields on the map while they are edited, by changing only this screen's copy of the document.
 * The returned function puts the saved values back without redrawing, so a save that follows does not flicker.
 */
export function attachLivePreview(form: HTMLFormElement, fields: FormFieldSpec[], document: any, liveNames: readonly string[], redraw: (changed: PlainObject) => void): () => PlainObject {
  const liveFields = fields.filter((field) => liveNames.includes(field.name));
  const saved = expandObject(Object.fromEntries(liveFields.map((field) => [field.name, getProperty(document._source, field.name)])));
  form.addEventListener("input", () => {
    if (!document.object || document.object.destroyed) return;
    const previewed = readForm(form, liveFields);
    document.updateSource(previewed);
    redraw(previewed);
  });
  return () => {
    document.updateSource(saved);
    return saved;
  };
}

/** Reads typed, range-checked values; unknown inputs are ignored. Dotted names become nested objects. */
export function readForm(form: HTMLFormElement, fields: FormFieldSpec[]): PlainObject {
  const flat: PlainObject = {};
  for (const field of fields) {
    const element = form.elements.namedItem(field.name);
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) flat[field.name] = coerce(field, element);
  }
  return expandObject(flat);
}
