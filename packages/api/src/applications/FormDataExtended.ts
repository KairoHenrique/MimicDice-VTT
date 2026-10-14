type FieldValue = string | number | boolean | null | string[];

const NUMERIC_INPUT_TYPES = new Set(["number", "range"]);

function readTypedValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, dtypes: Record<string, string>): FieldValue {
  const declaredType = element.dataset.dtype ?? dtypes[element.name];
  if (element instanceof HTMLInputElement && element.type === "checkbox") return element.checked;
  if (element instanceof HTMLSelectElement && element.multiple) return Array.from(element.selectedOptions, (option) => option.value);

  const rawValue = element.value;
  const numericInput = element instanceof HTMLInputElement && NUMERIC_INPUT_TYPES.has(element.type);
  if (numericInput || declaredType === "Number") return rawValue === "" ? null : Number(rawValue);
  if (declaredType === "Boolean") return rawValue === "true";
  if (declaredType === "JSON") {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}

interface CustomFormElement extends HTMLElement {
  name: string;
  value: string | string[];
  disabled: boolean;
}

/** Form-associated custom elements such as `<file-picker>`, `<prose-mirror>` and `<string-tags>`. */
function isCustomFormElement(element: Element): element is CustomFormElement {
  const value = (element as Partial<CustomFormElement>).value;
  return element.localName.includes("-") && (typeof value === "string" || Array.isArray(value));
}

export class FormDataExtended extends FormData {
  readonly object: Record<string, FieldValue> = {};
  readonly dtypes: Record<string, string>;

  constructor(form: HTMLFormElement, { dtypes = {}, disabled = false, readonly = true }: { dtypes?: Record<string, string>; disabled?: boolean; readonly?: boolean } = {}) {
    super();
    this.dtypes = dtypes;
    for (const element of Array.from(form.elements)) {
      if (isCustomFormElement(element)) {
        if (!element.name || (element.disabled && !disabled)) continue;
        const value = Array.isArray(element.value) ? [...element.value] : element.value;
        this.object[element.name] = value;
        this.set(element.name, Array.isArray(value) ? value.join(",") : value);
        continue;
      }
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (!element.name) continue;
      if (element.disabled && !disabled) continue;
      if (element instanceof HTMLInputElement && element.readOnly && !readonly) continue;
      if (element instanceof HTMLInputElement && element.type === "radio" && !element.checked) continue;
      if (element instanceof HTMLInputElement && (element.type === "submit" || element.type === "button")) continue;

      const value = readTypedValue(element, dtypes);
      this.object[element.name] = value;
      this.set(element.name, Array.isArray(value) ? value.join(",") : String(value ?? ""));
    }
  }
}
