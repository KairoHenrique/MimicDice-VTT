import { deepClone, expandObject, getType, mergeObject, type PlainObject } from "@tabbletop/common";
import { EmbeddedCollectionField, SchemaField, type FieldRecord } from "./compositeFields";
import { ForeignDocumentField, type CleanOptions } from "./scalarFields";

export interface DataModelConstructionContext {
  parent?: any;
  strict?: boolean;
  [option: string]: unknown;
}

const schemaCache = new WeakMap<Function, SchemaField>();

export class DataModel {
  static LOCALIZATION_PREFIXES: string[] = [];

  declare readonly _source: PlainObject;
  declare parent: any;
  [field: string]: any;

  constructor(data: PlainObject = {}, { parent = null, strict = true, ...options }: DataModelConstructionContext = {}) {
    Object.defineProperty(this, "parent", { value: parent, writable: true, enumerable: false, configurable: true });
    Object.defineProperty(this, "_source", { value: this._initializeSource(data, { strict, ...options }), writable: false, enumerable: false, configurable: true });
    this._configure({ strict, ...options });
    this._initialize({ strict, ...options });
  }

  static defineSchema(): FieldRecord {
    throw new Error(`The ${this.name} subclass of DataModel must define its Document schema`);
  }

  static get schema(): SchemaField {
    let schema = schemaCache.get(this);
    if (!schema) {
      schema = new SchemaField(Object.freeze(this.defineSchema()) as FieldRecord);
      Object.defineProperty(schema, "name", { value: undefined, writable: true });
      schemaCache.set(this, schema);
    }
    return schema;
  }

  get schema(): SchemaField {
    return (this.constructor as typeof DataModel).schema;
  }

  get invalid(): boolean {
    return false;
  }

  static cleanData(source: PlainObject = {}, options: CleanOptions = {}): PlainObject {
    return this.schema.clean(source, { ...options, source }) as PlainObject;
  }

  static migrateData(source: PlainObject): PlainObject {
    return source;
  }

  static migrateDataSafe(source: PlainObject): PlainObject {
    try {
      return this.migrateData(source) ?? source;
    } catch (error) {
      console.warn(`${this.name} data migration failed`, error);
      return source;
    }
  }

  static shimData(data: PlainObject): PlainObject {
    return data;
  }

  static fromSource(source: PlainObject, context: DataModelConstructionContext = {}): DataModel {
    return new this(source, context);
  }

  static fromJSON(json: string): DataModel {
    return this.fromSource(JSON.parse(json));
  }

  _initializeSource(data: unknown, options: CleanOptions = {}): PlainObject {
    const plain = data instanceof DataModel ? data.toObject() : data;
    const source = (getType(plain) === "Object" ? plain : {}) as PlainObject;
    const modelClass = this.constructor as typeof DataModel;
    return modelClass.cleanData(modelClass.migrateDataSafe(source), options);
  }

  /** Hook for subclasses to set up state (such as embedded collections) before fields are initialized. */
  _configure(_options: object = {}): void {}

  _initialize(options: object = {}): void {
    for (const [name, field] of this.schema.entries()) {
      const sourceValue = this._source[name];
      const value = sourceValue === undefined ? undefined : field.initialize(sourceValue, this, options);
      if (field instanceof ForeignDocumentField && typeof value === "function") {
        Object.defineProperty(this, name, { get: value as () => unknown, enumerable: true, configurable: true });
      } else {
        Object.defineProperty(this, name, { value, writable: true, enumerable: true, configurable: true });
      }
    }
  }

  reset(): void {
    this._initialize();
  }

  validate(_options: object = {}): boolean {
    const failure = this.schema.validate(this._source);
    return !failure;
  }

  /** Applies changes to `_source` in place (embedded collections are untouched) and re-initializes the model. */
  updateSource(changes: PlainObject = {}, options: { dryRun?: boolean } = {}): PlainObject {
    const expanded = expandObject(changes);
    const embeddedFieldNames = new Set(this.schema.entries().filter(([, field]) => field instanceof EmbeddedCollectionField).map(([name]) => name));
    const candidate: PlainObject = {};
    for (const [key, value] of Object.entries(this._source)) if (!embeddedFieldNames.has(key)) candidate[key] = deepClone(value);
    for (const key of embeddedFieldNames) delete expanded[key];
    mergeObject(candidate, deepClone(expanded), { performDeletions: true });
    for (const key of embeddedFieldNames) candidate[key] = this._source[key];
    (this.constructor as typeof DataModel).cleanData(candidate);
    if (options.dryRun) return expanded;

    for (const key of Object.keys(this._source)) if (!(key in candidate)) delete this._source[key];
    Object.assign(this._source, candidate);
    this._initialize();
    return expanded;
  }

  clone(data: PlainObject = {}, context: DataModelConstructionContext = {}): DataModel {
    const merged = mergeObject(this.toObject(), data, { insertKeys: false, performDeletions: true, inplace: true });
    return new (this.constructor as new (data: PlainObject, context: DataModelConstructionContext) => DataModel)(merged, { parent: this.parent, ...context });
  }

  toObject(source = true): PlainObject {
    if (source) return deepClone(this._source);
    return this.schema.toObject(this) as PlainObject;
  }

  toJSON(): PlainObject {
    return this.toObject();
  }
}

export class TypeDataModel extends DataModel {
  static override defineSchema(): FieldRecord {
    return {};
  }

  prepareBaseData(): void {}

  prepareDerivedData(): void {}

  getRollData(): PlainObject {
    return { ...this };
  }
}
