import { deepClone, getType, isDocumentId, type PlainObject } from "@tabbletop/common";
import { currentGame } from "../runtime";

export interface DataFieldOptions {
  required?: boolean;
  nullable?: boolean;
  initial?: unknown;
  readonly?: boolean;
  gmOnly?: boolean;
  label?: string;
  hint?: string;
  choices?: unknown;
  validate?: (value: unknown) => unknown;
  [option: string]: unknown;
}

export interface CleanOptions {
  partial?: boolean;
  source?: PlainObject;
  [option: string]: unknown;
}

export class DataModelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataModelValidationError";
  }
}

export class DataField {
  static hierarchical = false;
  static recursive = false;

  required!: boolean;
  nullable!: boolean;
  initial: unknown;
  readonly!: boolean;
  gmOnly!: boolean;
  label!: string;
  hint!: string;
  choices: unknown;
  validationFn?: (value: unknown) => unknown;
  name: string | undefined;
  parent: DataField | undefined;
  [option: string]: any;

  constructor(options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    const { validate, ...rest } = options;
    Object.assign(this, (this.constructor as typeof DataField)._defaults, rest);
    this.validationFn = validate;
    this.name = context.name;
    this.parent = context.parent;
  }

  static get _defaults(): DataFieldOptions {
    return { required: false, nullable: false, initial: undefined, readonly: false, gmOnly: false, label: "", hint: "" };
  }

  get fieldPath(): string {
    const parentPath = this.parent?.fieldPath;
    return [parentPath, this.name].filter(Boolean).join(".");
  }

  bind(name: string, parent: DataField | undefined): this {
    this.name = name;
    this.parent = parent;
    return this;
  }

  getInitialValue(data?: PlainObject): unknown {
    return typeof this.initial === "function" ? (this.initial as (data?: PlainObject) => unknown)(data) : deepClone(this.initial);
  }

  clean(value: unknown, options: CleanOptions = {}): unknown {
    if (value === undefined) return options.partial ? undefined : this.getInitialValue(options.source);
    if (value === null) return this.nullable ? null : this.getInitialValue(options.source);
    try {
      return this._cleanType(this._cast(value), options);
    } catch {
      return this.getInitialValue(options.source);
    }
  }

  _cast(value: unknown): unknown {
    return value;
  }

  _cleanType(value: unknown, _options: CleanOptions): unknown {
    return value;
  }

  validate(value: unknown): DataModelValidationError | void {
    if (value === undefined && this.required) return new DataModelValidationError(`${this.fieldPath} is required`);
    if (value === null && !this.nullable) return new DataModelValidationError(`${this.fieldPath} may not be null`);
    if (value === undefined || value === null) return;
    const typeFailure = this._validateType(value);
    if (typeFailure) return typeFailure;
    const customResult = this.validationFn?.(value);
    if (customResult === false) return new DataModelValidationError(`${this.fieldPath} failed custom validation`);
  }

  _validateType(_value: unknown): DataModelValidationError | void {}

  initialize(value: unknown, _model?: unknown, _options?: object): unknown {
    return value;
  }

  toObject(value: unknown): unknown {
    return deepClone(value);
  }

  toInput(): HTMLElement {
    const input = document.createElement("input");
    input.name = this.fieldPath;
    return input;
  }
}

export class StringField extends DataField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, blank: true, trim: true, nullable: false, initial: undefined, choices: undefined, textSearch: false };
  }

  override getInitialValue(data?: PlainObject): unknown {
    const initial = super.getInitialValue(data);
    if (initial !== undefined) return initial;
    if (this.nullable) return null;
    return this.blank ? "" : undefined;
  }

  override _cast(value: unknown): unknown {
    return String(value);
  }

  override _cleanType(value: unknown): unknown {
    const text = this.trim ? (value as string).trim() : (value as string);
    if (!text && !this.blank) return this.nullable ? null : this.getInitialValue();
    return text;
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    if (typeof value !== "string") return new DataModelValidationError(`${this.fieldPath} must be a string`);
    const choices = typeof this.choices === "function" ? (this.choices as () => unknown)() : this.choices;
    if (!choices) return;
    const allowed = Array.isArray(choices) ? choices : Object.keys(choices as object);
    if (!allowed.includes(value)) return new DataModelValidationError(`${this.fieldPath} must be one of ${allowed.join(", ")}`);
  }
}

export class NumberField extends DataField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, initial: null, nullable: true, integer: false, positive: false, min: undefined, max: undefined, step: undefined };
  }

  override _cast(value: unknown): unknown {
    return Number(value);
  }

  override _cleanType(value: unknown, options: CleanOptions): unknown {
    let number = value as number;
    if (Number.isNaN(number)) return this.nullable ? null : this.getInitialValue(options.source);
    if (this.integer) number = Math.round(number);
    if (typeof this.min === "number") number = Math.max(number, this.min);
    if (typeof this.max === "number") number = Math.min(number, this.max);
    if (typeof this.step === "number" && this.step > 0) {
      const base = typeof this.min === "number" ? this.min : 0;
      number = Number((Math.round((number - base) / this.step) * this.step + base).toFixed(6));
    }
    return number;
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    if (typeof value !== "number" || Number.isNaN(value)) return new DataModelValidationError(`${this.fieldPath} must be a number`);
    if (this.integer && !Number.isInteger(value)) return new DataModelValidationError(`${this.fieldPath} must be an integer`);
    if (this.positive && value <= 0) return new DataModelValidationError(`${this.fieldPath} must be positive`);
  }
}

export class BooleanField extends DataField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, initial: false };
  }

  override _cast(value: unknown): unknown {
    if (typeof value === "string") return value === "true";
    return Boolean(value);
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    if (typeof value !== "boolean") return new DataModelValidationError(`${this.fieldPath} must be a boolean`);
  }
}

export class ObjectField extends DataField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, required: true, nullable: false, initial: () => ({}) };
  }

  override getInitialValue(data?: PlainObject): unknown {
    return super.getInitialValue(data) ?? {};
  }

  override _cast(value: unknown): unknown {
    return getType(value) === "Object" ? value : {};
  }

  override initialize(value: unknown): unknown {
    return deepClone(value);
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    if (getType(value) !== "Object") return new DataModelValidationError(`${this.fieldPath} must be an object`);
  }
}

export class AnyField extends DataField {}

export class JSONField extends StringField {
  override _cast(value: unknown): unknown {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  override initialize(value: unknown): unknown {
    if (typeof value !== "string" || value === "") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  override toObject(value: unknown): unknown {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
}

export class HTMLField extends StringField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, required: true, blank: true };
  }
}

export class TextField extends StringField {}

export class FilePathField extends StringField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, categories: [], base64: false, wildcard: false, nullable: true, blank: false, initial: null };
  }
}

export class ColorField extends StringField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, nullable: true, initial: null, blank: false };
  }

  override _cleanType(value: unknown): unknown {
    const text = String(value).trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    return /^#[0-9a-f]{6}$/.test(text) ? text : this.getInitialValue();
  }
}

export class DocumentIdField extends StringField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, required: true, blank: false, nullable: true, initial: null, readonly: true };
  }

  override _cleanType(value: unknown): unknown {
    return isDocumentId(value) ? value : null;
  }
}

export class ForeignDocumentField extends DocumentIdField {
  constructor(readonly model: { documentName: string } | string, options: DataFieldOptions = {}, context = {}) {
    super({ readonly: false, ...options }, context);
  }

  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, idOnly: false, readonly: false };
  }

  override initialize(value: unknown): unknown {
    if (this.idOnly || !value) return value ?? null;
    const documentName = typeof this.model === "string" ? this.model : this.model.documentName;
    return () => currentGame()?.collections?.get(documentName)?.get(value) ?? null;
  }

  override toObject(value: unknown): unknown {
    return (value as { _id?: string } | null)?._id ?? value;
  }
}

export class IntegerSortField extends NumberField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, integer: true, initial: 0, nullable: false };
  }
}

export class AlphaField extends NumberField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, initial: 1, min: 0, max: 1, nullable: false };
  }
}

export class AngleField extends NumberField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, initial: 0, min: 0, max: 360, nullable: false };
  }
}

export class DocumentOwnershipField extends ObjectField {
  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, initial: () => ({ default: 0 }) };
  }
}

export class DocumentFlagsField extends ObjectField {}

export class DocumentStatsField extends ObjectField {}

export class DocumentTypeField extends StringField {
  constructor(readonly documentClass: { documentName: string }, options: DataFieldOptions = {}, context = {}) {
    super({ required: true, blank: false, ...options }, context);
  }

  override getInitialValue(data?: PlainObject): unknown {
    return super.getInitialValue(data) ?? currentGame()?.documentTypes?.[this.documentClass.documentName]?.[0] ?? "base";
  }
}