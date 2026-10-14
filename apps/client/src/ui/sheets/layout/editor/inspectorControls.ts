import { h } from "../../../../views/dom";

let controlCounter = 0;

function controlId(): string {
  controlCounter += 1;
  return `md-insp-${controlCounter}`;
}

/** `focusKey` lets the editor restore focus to the same control after it re-renders. */
function row(label: string, control: HTMLElement, focusKey: string, hint?: string): HTMLElement {
  const id = controlId();
  control.id = id;
  control.dataset.focusKey = focusKey;
  return h("div", { class: "md-insp-row" }, h("label", { for: id }, label), control, hint ? h("span", { class: "hint" }, hint) : null);
}

export function textRow(label: string, value: string, focusKey: string, onChange: (value: string) => void, options: { maxlength?: number; placeholder?: string; hint?: string } = {}): HTMLElement {
  const input = h("input", { type: "text", value, maxlength: options.maxlength ?? 60, placeholder: options.placeholder ?? "" });
  input.addEventListener("change", () => onChange(input.value));
  return row(label, input, focusKey, options.hint);
}

export function textareaRow(label: string, value: string, focusKey: string, onChange: (value: string) => void, options: { maxlength?: number; hint?: string } = {}): HTMLElement {
  const textarea = h("textarea", { rows: 3, maxlength: options.maxlength ?? 4000 }, value);
  textarea.addEventListener("change", () => onChange(textarea.value));
  return row(label, textarea, focusKey, options.hint);
}

export function numberRow(label: string, value: number | undefined, focusKey: string, onChange: (value: number | undefined) => void, options: { min?: number; max?: number; step?: number; hint?: string } = {}): HTMLElement {
  const input = h("input", { type: "number", value: value === undefined ? "" : String(value), min: options.min, max: options.max, step: options.step ?? 1 });
  input.addEventListener("change", () => onChange(input.value.trim() === "" || !Number.isFinite(input.valueAsNumber) ? undefined : input.valueAsNumber));
  return row(label, input, focusKey, options.hint);
}

export function selectRow<T extends string>(label: string, value: T, choices: ReadonlyArray<readonly [T, string]>, focusKey: string, onChange: (value: T) => void): HTMLElement {
  const select = h("select", {});
  for (const [choice, text] of choices) select.append(h("option", { value: choice, selected: choice === value }, text));
  select.addEventListener("change", () => onChange(select.value as T));
  return row(label, select, focusKey);
}

export function checkRow(label: string, checked: boolean, focusKey: string, onChange: (checked: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked });
  input.dataset.focusKey = focusKey;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "md-insp-check" }, input, h("span", {}, label));
}

/** Color input plus a reset button, since a native color input cannot be empty. */
export function colorRow(label: string, value: string | undefined, focusKey: string, onChange: (value: string | undefined) => void): HTMLElement {
  const input = h("input", { type: "color", value: value ?? "#000000", "aria-label": label });
  input.dataset.focusKey = focusKey;
  input.addEventListener("change", () => onChange(input.value));
  const reset = h("button", { type: "button", class: "md-icon-button", title: "Usar cor padrão", disabled: !value }, h("i", { class: "fa-solid fa-rotate-left" }));
  reset.addEventListener("click", () => onChange(undefined));
  return h("div", { class: `md-insp-color${value ? "" : " unset"}` }, h("span", {}, label), input, reset);
}

export function inspectorSection(title: string, ...children: Array<HTMLElement | null>): HTMLElement {
  return h("fieldset", { class: "md-insp-section" }, h("legend", {}, title), ...children);
}
