import Handlebars from "handlebars";
import { currentGame } from "../runtime";

type HelperOptions = Handlebars.HelperOptions;

const escape = (value: unknown) => Handlebars.escapeExpression(String(value ?? ""));

function localizeText(key: string): string {
  return currentGame()?.i18n?.localize(key) ?? key;
}

function stripOptions(args: unknown[]): unknown[] {
  return args.slice(0, -1);
}

interface SelectOptionsHash {
  selected?: unknown;
  blank?: string | null;
  localize?: boolean;
  nameAttr?: string;
  labelAttr?: string;
  valueAttr?: string;
  sort?: boolean;
}

function normalizeChoices(choices: unknown, hash: SelectOptionsHash): Array<{ value: string; label: string }> {
  const valueAttribute = hash.valueAttr ?? hash.nameAttr;
  const labelAttribute = hash.labelAttr ?? "label";
  const normalizeEntry = (key: string, entry: unknown) => {
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      return { value: String(valueAttribute ? record[valueAttribute] : record.value ?? key), label: String(record[labelAttribute] ?? key) };
    }
    return { value: key, label: String(entry) };
  };
  const options = Array.isArray(choices)
    ? choices.map((entry) => (entry && typeof entry === "object" ? normalizeEntry("", entry) : { value: String(entry), label: String(entry) }))
    : Object.entries((choices as Record<string, unknown>) ?? {}).map(([key, entry]) => normalizeEntry(key, entry));
  const localized = options.map((option) => ({ ...option, label: hash.localize ? localizeText(option.label) : option.label }));
  return hash.sort ? localized.sort((left, right) => left.label.localeCompare(right.label)) : localized;
}

function selectOptions(choices: unknown, options: HelperOptions): Handlebars.SafeString {
  const hash = options.hash as SelectOptionsHash;
  const selectedValues = new Set((Array.isArray(hash.selected) ? hash.selected : [hash.selected]).map((value) => String(value ?? "")));
  const html: string[] = [];
  if (hash.blank !== undefined && hash.blank !== null) {
    html.push(`<option value=""${selectedValues.has("") ? " selected" : ""}>${escape(localizeText(hash.blank))}</option>`);
  }
  for (const option of normalizeChoices(choices, hash)) {
    const isSelected = selectedValues.has(option.value) ? " selected" : "";
    html.push(`<option value="${escape(option.value)}"${isSelected}>${escape(option.label)}</option>`);
  }
  return new Handlebars.SafeString(html.join(""));
}

function radioBoxes(name: string, choices: Record<string, string>, options: HelperOptions): Handlebars.SafeString {
  const { checked, localize: shouldLocalize } = options.hash as { checked?: string; localize?: boolean };
  const html = Object.entries(choices ?? {}).map(([value, label]) => {
    const isChecked = String(checked) === value ? " checked" : "";
    const text = shouldLocalize ? localizeText(label) : label;
    return `<label class="checkbox"><input type="radio" name="${escape(name)}" value="${escape(value)}"${isChecked}> ${escape(text)}</label>`;
  });
  return new Handlebars.SafeString(html.join(""));
}

function numberFormat(value: unknown, options: HelperOptions): string {
  const { decimals = 0, sign = false } = options.hash as { decimals?: number; sign?: boolean };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  const formatted = numeric.toFixed(decimals);
  return sign && numeric >= 0 ? `+${formatted}` : formatted;
}

function filePicker(options: HelperOptions): Handlebars.SafeString {
  const { type = "any", target = "" } = options.hash as { type?: string; target?: string };
  return new Handlebars.SafeString(
    `<button type="button" class="file-picker" data-type="${escape(type)}" data-target="${escape(target)}" title="Browse Files" tabindex="-1"><i class="fas fa-file-import fa-fw"></i></button>`,
  );
}

/** `{{editor content target="system.bio" button=true editable=true}}`: content is already-enriched HTML. */
function editor(content: unknown, options: HelperOptions): Handlebars.SafeString {
  const { target = "", button = true, editable = true, class: extraClass = "" } = options.hash as { target?: string; button?: boolean; editable?: boolean; class?: string };
  const editButton = button && editable ? `<a class="editor-edit" title="Editar"><i class="fa-solid fa-edit"></i></a>` : "";
  const dataEdit = editable ? ` data-edit="${escape(target)}"` : "";
  return new Handlebars.SafeString(`<div class="editor ${escape(extraClass)}"><div class="editor-content"${dataEdit}>${String(content ?? "")}</div>${editButton}</div>`);
}

export function registerFoundryHandlebarsHelpers(): void {
  Handlebars.registerHelper({
    checked: (value: unknown) => (value ? "checked" : ""),
    disabled: (value: unknown) => (value ? "disabled" : ""),
    selected: (value: unknown) => (value ? "selected" : ""),
    concat: (...args: unknown[]) => new Handlebars.SafeString(stripOptions(args).map(String).join("")),
    localize: (key: string, options: HelperOptions) => {
      const data = options.hash as Record<string, unknown>;
      return Object.keys(data).length ? currentGame()?.i18n?.format(key, data) ?? key : localizeText(key);
    },
    json: (value: unknown) => JSON.stringify(value),
    eq: (left: unknown, right: unknown) => left === right,
    ne: (left: unknown, right: unknown) => left !== right,
    lt: (left: number, right: number) => left < right,
    lte: (left: number, right: number) => left <= right,
    gt: (left: number, right: number) => left > right,
    gte: (left: number, right: number) => left >= right,
    not: (value: unknown) => !value,
    and: (...args: unknown[]) => stripOptions(args).every(Boolean),
    or: (...args: unknown[]) => stripOptions(args).some(Boolean),
    ifThen: (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
    numberFormat,
    selectOptions,
    radioBoxes,
    filePicker,
    editor,
    timeSince: (timestamp: string | number) => new Date(timestamp).toLocaleString(),
  });
}
