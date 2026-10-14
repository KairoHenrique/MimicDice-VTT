import { DOCUMENT_OWNERSHIP_LEVELS, getProperty, resolveOwnershipLevel, type PlainObject } from "@tabbletop/common";
import { DataModel, type DataModelConstructionContext } from "../../data/DataModel";
import { EmbeddedCollectionField } from "../../data/compositeFields";
import { currentConfig, currentGame } from "../../runtime";
import { EmbeddedCollection } from "./EmbeddedCollection";

export interface DocumentMetadata {
  name: string;
  collection: string | null;
  label: string;
  labelPlural?: string;
  embedded: Record<string, string>;
  hasTypeData: boolean;
  indexed: boolean;
  coreTypes?: string[];
  compendiumIndexFields: string[];
  permissions: { create: string; update: string; delete: string };
  schemaVersion?: string;
  [extra: string]: unknown;
}

export interface DocumentOperation {
  parent?: Document | null;
  pack?: string | null;
  render?: boolean;
  renderSheet?: boolean;
  keepId?: boolean;
  diff?: boolean;
  [option: string]: unknown;
}

export interface DatabaseBackendLike {
  create(documentClass: typeof Document, operation: DocumentOperation & { data: PlainObject[] }): Promise<Document[]>;
  update(documentClass: typeof Document, operation: DocumentOperation & { updates: PlainObject[] }): Promise<Document[]>;
  delete(documentClass: typeof Document, operation: DocumentOperation & { ids: string[] }): Promise<Document[]>;
  getFlagScopes(): string[];
}

export type UserLike = { id: string; isGM: boolean } | null | undefined;

export class Document extends DataModel {
  static metadata: DocumentMetadata = Object.freeze({
    name: "Document",
    collection: null,
    label: "DOCUMENT.Document",
    embedded: {},
    hasTypeData: false,
    indexed: false,
    compendiumIndexFields: [],
    permissions: { create: "ASSISTANT", update: "OWNER", delete: "ASSISTANT" },
  });

  static DEFAULT_ICON: string | null = null;

  declare collections: Record<string, EmbeddedCollection>;

  constructor(data: PlainObject = {}, context: DataModelConstructionContext = {}) {
    super(data, context);
  }

  static get documentName(): string {
    return this.metadata.name;
  }

  get documentName(): string {
    return (this.constructor as typeof Document).documentName;
  }

  static get collectionName(): string | null {
    return this.metadata.collection;
  }

  get collectionName(): string | null {
    return (this.constructor as typeof Document).collectionName;
  }

  static get implementation(): typeof Document {
    return currentConfig()?.[this.documentName]?.documentClass ?? this;
  }

  static get baseDocument(): typeof Document {
    let candidate: any = this;
    while (candidate && !Object.prototype.hasOwnProperty.call(candidate, "metadata")) candidate = Object.getPrototypeOf(candidate);
    return candidate ?? this;
  }

  static get hasTypeData(): boolean {
    return this.metadata.hasTypeData;
  }

  static get TYPES(): string[] {
    return currentGame()?.documentTypes?.[this.documentName] ?? ["base"];
  }

  static get database(): DatabaseBackendLike {
    return currentConfig().DatabaseBackend;
  }

  static get hierarchy(): Record<string, EmbeddedCollectionField> {
    const hierarchy: Record<string, EmbeddedCollectionField> = {};
    for (const [name, field] of this.schema.entries()) if (field instanceof EmbeddedCollectionField) hierarchy[name] = field;
    return hierarchy;
  }

  override _configure(options: object = {}): void {
    super._configure(options);
    const collections: Record<string, EmbeddedCollection> = {};
    for (const [fieldName, field] of Object.entries((this.constructor as typeof Document).hierarchy)) {
      collections[fieldName] = new EmbeddedCollection(fieldName, this, field);
    }
    Object.defineProperty(this, "collections", { value: Object.seal(collections), writable: false, enumerable: false });
  }

  get id(): string {
    return this._id;
  }

  get isEmbedded(): boolean {
    return this.parent instanceof Document && this.documentName in (this.parent.constructor as typeof Document).metadata.embedded;
  }

  get uuid(): string {
    if (this.isEmbedded) return `${this.parent.uuid}.${this.documentName}.${this.id}`;
    return `${this.documentName}.${this.id}`;
  }

  get pack(): string | null {
    return null;
  }

  get inCompendium(): boolean {
    return false;
  }

  get collection(): any {
    if (this.isEmbedded) return this.parent.getEmbeddedCollection(this.documentName);
    return currentGame()?.collections?.get(this.documentName);
  }

  get isOwner(): boolean {
    return this.testUserPermission(currentGame()?.user, "OWNER");
  }

  get limited(): boolean {
    return this.testUserPermission(currentGame()?.user, "LIMITED", { exact: true });
  }

  get permission(): number {
    return this.getUserLevel(currentGame()?.user);
  }

  get hasPlayerOwner(): boolean {
    const users = currentGame()?.users;
    if (!users) return false;
    return users.some((user: { isGM: boolean }) => !user.isGM && this.testUserPermission(user as UserLike, "OWNER"));
  }

  getUserLevel(user: UserLike = currentGame()?.user): number {
    if (!user) return DOCUMENT_OWNERSHIP_LEVELS.NONE;
    if (user.isGM) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const inheritedLevel = this.isEmbedded ? this.parent.getUserLevel(user) : DOCUMENT_OWNERSHIP_LEVELS.NONE;
    if (!("ownership" in this._source)) return inheritedLevel;
    return resolveOwnershipLevel(this._source.ownership, user.id, false, inheritedLevel);
  }

  testUserPermission(user: UserLike, permission: string | number, { exact = false }: { exact?: boolean } = {}): boolean {
    const required = typeof permission === "string" ? DOCUMENT_OWNERSHIP_LEVELS[permission as keyof typeof DOCUMENT_OWNERSHIP_LEVELS] : permission;
    const level = this.getUserLevel(user);
    return exact ? level === required : level >= required;
  }

  canUserModify(user: UserLike, action: "create" | "update" | "delete"): boolean {
    if (!user) return false;
    if (user.isGM) return true;
    if (action === "create") return this.isEmbedded ? this.parent.canUserModify(user, "update") : (this.constructor as typeof Document).canUserCreate(user);
    return this.testUserPermission(user, "OWNER");
  }

  static canUserCreate(user: UserLike): boolean {
    if (!user) return false;
    if (user.isGM) return true;
    const createPermission = this.metadata.permissions.create;
    const userWithPermissions = user as { can?: (permission: string) => boolean };
    return createPermission !== "ASSISTANT" && createPermission !== "GAMEMASTER" && Boolean(userWithPermissions.can?.(createPermission));
  }

  static async create(data: PlainObject | PlainObject[] = {}, operation: DocumentOperation = {}): Promise<any> {
    const created = await this.createDocuments(Array.isArray(data) ? data : [data], operation);
    return Array.isArray(data) ? created : created.shift();
  }

  static async createDocuments(data: PlainObject[] = [], operation: DocumentOperation = {}): Promise<Document[]> {
    const sources = data.map((entry) => (entry instanceof DataModel ? entry.toObject() : entry));
    return this.database.create(this.implementation, { ...operation, data: sources });
  }

  static async updateDocuments(updates: PlainObject[] = [], operation: DocumentOperation = {}): Promise<Document[]> {
    return this.database.update(this.implementation, { ...operation, updates });
  }

  static async deleteDocuments(ids: string[] = [], operation: DocumentOperation = {}): Promise<Document[]> {
    return this.database.delete(this.implementation, { ...operation, ids });
  }

  async update(data: PlainObject = {}, operation: DocumentOperation = {}): Promise<this | undefined> {
    const updated = await (this.constructor as typeof Document).updateDocuments([{ ...data, _id: this.id }], { ...operation, parent: this.parent });
    return updated.shift() as this | undefined;
  }

  async delete(operation: DocumentOperation = {}): Promise<this | undefined> {
    const deleted = await (this.constructor as typeof Document).deleteDocuments([this.id], { ...operation, parent: this.parent });
    return deleted.shift() as this | undefined;
  }

  getEmbeddedCollection(embeddedName: string): EmbeddedCollection {
    const fieldName = (this.constructor as typeof Document).metadata.embedded[embeddedName];
    const collection = fieldName ? this.collections[fieldName] : undefined;
    if (!collection) throw new Error(`${embeddedName} is not a valid embedded Document within the ${this.documentName} Document`);
    return collection;
  }

  getEmbeddedDocument(embeddedName: string, id: string, { strict = false }: { strict?: boolean } = {}): Document | undefined {
    return this.getEmbeddedCollection(embeddedName).get(id, { strict });
  }

  async createEmbeddedDocuments(embeddedName: string, data: PlainObject[] = [], operation: DocumentOperation = {}): Promise<Document[]> {
    return this.getEmbeddedCollection(embeddedName).documentClass.createDocuments(data, { ...operation, parent: this });
  }

  async updateEmbeddedDocuments(embeddedName: string, updates: PlainObject[] = [], operation: DocumentOperation = {}): Promise<Document[]> {
    return this.getEmbeddedCollection(embeddedName).documentClass.updateDocuments(updates, { ...operation, parent: this });
  }

  async deleteEmbeddedDocuments(embeddedName: string, ids: string[] = [], operation: DocumentOperation = {}): Promise<Document[]> {
    return this.getEmbeddedCollection(embeddedName).documentClass.deleteDocuments(ids, { ...operation, parent: this });
  }

  #assertFlagScope(scope: string): void {
    const scopes = (this.constructor as typeof Document).database.getFlagScopes();
    if (!scopes.includes(scope)) throw new Error(`Flag scope "${scope}" is not valid or not currently active`);
  }

  getFlag(scope: string, key: string): any {
    this.#assertFlagScope(scope);
    return getProperty(this._source.flags?.[scope] ?? this.flags?.[scope], key);
  }

  async setFlag(scope: string, key: string, value: unknown): Promise<this | undefined> {
    this.#assertFlagScope(scope);
    return this.update({ flags: { [scope]: { [key]: value } } });
  }

  async unsetFlag(scope: string, key: string): Promise<this | undefined> {
    this.#assertFlagScope(scope);
    const path = key.split(".");
    const tail = `-=${path.pop()}`;
    return this.update({ [["flags", scope, ...path, tail].join(".")]: null });
  }

  /* Lifecycle hooks overridden by subclasses; returning false from a _pre* method cancels the operation. */
  async _preCreate(_data: PlainObject, _options: DocumentOperation, _user: unknown): Promise<boolean | void> {}
  _onCreate(_data: PlainObject, _options: DocumentOperation, _userId: string): void {}
  async _preUpdate(_changes: PlainObject, _options: DocumentOperation, _user: unknown): Promise<boolean | void> {}
  _onUpdate(_changed: PlainObject, _options: DocumentOperation, _userId: string): void {}
  async _preDelete(_options: DocumentOperation, _user: unknown): Promise<boolean | void> {}
  _onDelete(_options: DocumentOperation, _userId: string): void {}
  _onCreateDescendantDocuments(_parent: Document, _collection: string, _documents: Document[], _data: PlainObject[], _options: DocumentOperation, _userId: string): void {}
  _onUpdateDescendantDocuments(_parent: Document, _collection: string, _documents: Document[], _changes: PlainObject[], _options: DocumentOperation, _userId: string): void {}
  _onDeleteDescendantDocuments(_parent: Document, _collection: string, _documents: Document[], _ids: string[], _options: DocumentOperation, _userId: string): void {}
}
