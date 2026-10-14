import { deepClone, getType, isUnsafeObjectKey, mergeObject, type PlainObject } from "@tabbletop/common";
import { currentConfig, currentGame } from "../runtime";
import { DataField, DataModelValidationError, ObjectField, type CleanOptions, type DataFieldOptions } from "./scalarFields";

export type FieldRecord = Record<string, DataField>;

export class SchemaField extends DataField {
  readonly fields: FieldRecord;

  constructor(fields: FieldRecord, options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    super(options, context);
    this.fields = {};
    for (const [name, field] of Object.entries(fields)) {
      if (!(field instanceof DataField)) throw new Error(`Schema field "${name}" must be a DataField instance`);
      this.fields[name] = field.bind(name, this);
    }
  }

  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, required: true, nullable: false };
  }

  get(name: string): DataField | undefined {
    return this.fields[name];
  }

  has(name: string): boolean {
    return name in this.fields;
  }

  keys(): string[] {
    return Object.keys(this.fields);
  }

  values(): DataField[] {
    return Object.values(this.fields);
  }

  entries(): Array<[string, DataField]> {
    return Object.entries(this.fields);
  }

  *[Symbol.iterator](): Generator<DataField> {
    yield* Object.values(this.fields);
  }

  getField(fieldPath: string | string[]): DataField | undefined {
    const [head, ...rest] = Array.isArray(fieldPath) ? fieldPath : fieldPath.split(".");
    const field = this.fields[head];
    if (!field || rest.length === 0) return field;
    return field instanceof SchemaField ? field.getField(rest) : undefined;
  }

  override getInitialValue(data?: PlainObject): unknown {
    const custom = this.initial === undefined ? undefined : super.getInitialValue(data);
    if (custom !== undefined) return custom;
    const initial: PlainObject = {};
    for (const [name, field] of this.entries()) initial[name] = field.getInitialValue(data);
    return initial;
  }

  /** Cleans in place so embedded sources keep their identity inside the parent's arrays. */
  override _cleanType(value: unknown, options: CleanOptions): unknown {
    const data = (getType(value) === "Object" ? value : {}) as PlainObject;
    const source = options.source ?? data;
    for (const key of Object.keys(data)) {
      if (isUnsafeObjectKey(key) || (!(key in this.fields) && !(options.partial && key.startsWith("-=")))) delete data[key];
    }
    for (const [name, field] of this.entries()) {
      if (options.partial && !(name in data)) continue;
      const cleaned = field.clean(data[name], { ...options, source });
      if (cleaned === undefined) delete data[name];
      else data[name] = cleaned;
    }
    return data;
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    if (getType(value) !== "Object") return new DataModelValidationError(`${this.fieldPath || "schema"} must be an object`);
    for (const [name, field] of this.entries()) {
      const failure = field.validate((value as PlainObject)[name]);
      if (failure) return failure;
    }
  }

  override initialize(value: unknown, model?: unknown, options?: object): unknown {
    if (!value) return value;
    const initialized: PlainObject = {};
    for (const [name, field] of this.entries()) initialized[name] = field.initialize((value as PlainObject)[name], model, options);
    return initialized;
  }

  override toObject(value: unknown): unknown {
    if (!value) return value;
    const plain: PlainObject = {};
    for (const [name, field] of this.entries()) {
      const fieldValue = (value as PlainObject)[name];
      if (fieldValue !== undefined) plain[name] = field.toObject(fieldValue);
    }
    return plain;
  }
}

export class ArrayField extends DataField {
  constructor(readonly element: DataField, options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    super(options, context);
    element.bind("element", this);
  }

  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, required: true, nullable: false, initial: () => [], min: 0, max: Infinity };
  }

  override _cast(value: unknown): unknown {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return Array.from(value);
    if (getType(value) === "Object") return Object.values(value as PlainObject);
    return [value];
  }

  override _cleanType(value: unknown, options: CleanOptions): unknown {
    return (value as unknown[]).map((item) => this.element.clean(item, { ...options, partial: false }));
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    if (!Array.isArray(value)) return new DataModelValidationError(`${this.fieldPath} must be an array`);
  }

  override initialize(value: unknown, model?: unknown, options?: object): unknown {
    if (!Array.isArray(value)) return value;
    return value.map((item) => this.element.initialize(item, model, options));
  }

  override toObject(value: unknown): unknown {
    if (!value || typeof (value as Iterable<unknown>)[Symbol.iterator] !== "function") return value;
    return Array.from(value as Iterable<unknown>, (item) => this.element.toObject(item));
  }
}

/** An object with arbitrary keys whose values all share one element field (Foundry v13 TypedObjectField). */
export class TypedObjectField extends ObjectField {
  constructor(readonly element: DataField, options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    super(options, context);
    element.bind("element", this);
  }

  static override get _defaults(): DataFieldOptions {
    return { ...super._defaults, validateKey: undefined };
  }

  #acceptsKey(key: string): boolean {
    if (isUnsafeObjectKey(key)) return false;
    return typeof this.validateKey !== "function" || this.validateKey(key) !== false;
  }

  override _cleanType(value: unknown, options: CleanOptions): unknown {
    const data = value as PlainObject;
    for (const key of Object.keys(data)) {
      if (options.partial && key.startsWith("-=")) continue;
      if (!this.#acceptsKey(key)) {
        delete data[key];
        continue;
      }
      data[key] = this.element.clean(data[key], { ...options, partial: false });
    }
    return data;
  }

  override _validateType(value: unknown): DataModelValidationError | void {
    const failure = super._validateType(value);
    if (failure) return failure;
    for (const [key, entry] of Object.entries(value as PlainObject)) {
      if (!this.#acceptsKey(key)) return new DataModelValidationError(`${this.fieldPath} has an invalid key "${key}"`);
      const entryFailure = this.element.validate(entry);
      if (entryFailure) return entryFailure;
    }
  }

  override initialize(value: unknown, model?: unknown, options?: object): unknown {
    if (getType(value) !== "Object") return value;
    const initialized: PlainObject = {};
    for (const [key, entry] of Object.entries(value as PlainObject)) initialized[key] = this.element.initialize(entry, model, options);
    return initialized;
  }

  override toObject(value: unknown): unknown {
    if (getType(value) !== "Object") return value;
    const plain: PlainObject = {};
    for (const [key, entry] of Object.entries(value as PlainObject)) plain[key] = this.element.toObject(entry);
    return plain;
  }
}

export class SetField extends ArrayField {
  override initialize(value: unknown, model?: unknown, options?: object): unknown {
    const items = super.initialize(value, model, options);
    return Array.isArray(items) ? new Set(items) : items;
  }
}

interface ModelClass {
  defineSchema(): FieldRecord;
  cleanData(source?: PlainObject, options?: CleanOptions): PlainObject;
  new (data?: PlainObject, options?: object): any;
}

export class EmbeddedDataField extends SchemaField {
  constructor(readonly model: ModelClass, options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    super(model.defineSchema(), options, context);
  }

  override initialize(value: unknown, model?: unknown, options?: object): unknown {
    if (!value) return value;
    return new this.model(value as PlainObject, { parent: model, ...options });
  }

  override toObject(value: unknown): unknown {
    return typeof (value as { toObject?: unknown })?.toObject === "function" ? (value as { toObject(): unknown }).toObject() : deepClone(value);
  }
}

interface EmbeddedDocumentClass extends ModelClass {
  documentName: string;
  implementation: EmbeddedDocumentClass;
  schema: SchemaField;
}

export class EmbeddedCollectionField extends ArrayField {
  constructor(readonly model: EmbeddedDocumentClass, options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    super(new ObjectField(), options, context);
  }

  get documentClass(): EmbeddedDocumentClass {
    return this.model.implementation ?? this.model;
  }

  override _cleanType(value: unknown, options: CleanOptions): unknown {
    return (value as unknown[]).map((item) => this.documentClass.cleanData(getType(item) === "Object" ? (item as PlainObject) : {}, { ...options, partial: false, source: undefined }));
  }

  override initialize(_value: unknown, model?: unknown): unknown {
    const collection = (model as { collections?: Record<string, { initialize(): void }> })?.collections?.[this.name as string];
    collection?.initialize();
    return collection;
  }

  override toObject(value: unknown): unknown {
    if (!value) return [];
    return Array.from(value as Iterable<{ toObject(source?: boolean): unknown }>, (document) => document.toObject(false));
  }
}

export class TypeDataField extends ObjectField {
  constructor(readonly document: { documentName: string }, options: DataFieldOptions = {}, context: { name?: string; parent?: DataField } = {}) {
    super(options, context);
  }

  getModelForType(subtype: unknown): ModelClass | undefined {
    if (typeof subtype !== "string") return undefined;
    return currentConfig()?.[this.document.documentName]?.dataModels?.[subtype];
  }

  #templateFor(subtype: unknown): PlainObject {
    const template = typeof subtype === "string" ? currentGame()?.model?.[this.document.documentName]?.[subtype] : undefined;
    return template ? deepClone(template) : {};
  }

  override getInitialValue(data?: PlainObject): unknown {
    const model = this.getModelForType(data?.type);
    return model ? model.cleanData() : this.#templateFor(data?.type);
  }

  override _cleanType(value: unknown, options: CleanOptions): unknown {
    const subtype = options.source?.type;
    const model = this.getModelForType(subtype);
    if (model) return model.cleanData(value as PlainObject, { ...options, source: undefined });
    if (options.partial) return value;
    return mergeObject(this.#templateFor(subtype), value as PlainObject, { inplace: true });
  }

  override initialize(value: unknown, model?: unknown, options?: object): unknown {
    const subtype = (model as { _source?: PlainObject })?._source?.type;
    const dataModel = this.getModelForType(subtype);
    if (dataModel) return new dataModel(value as PlainObject, { parent: model, ...options });
    return deepClone(value);
  }

  override toObject(value: unknown): unknown {
    return typeof (value as { toObject?: unknown })?.toObject === "function" ? (value as { toObject(): unknown }).toObject() : deepClone(value);
  }
}
