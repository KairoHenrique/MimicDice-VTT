import type { PlainObject } from "@tabbletop/common";
import type { EmbeddedCollectionField } from "../../data/compositeFields";
import { Collection } from "../../utils/Collection";

/**
 * Embedded documents of one field. Each child's `_source` is the very object stored in the parent's source array,
 * so updating a child updates the parent's source as well.
 */
export class EmbeddedCollection extends Collection<any> {
  constructor(
    readonly name: string,
    readonly model: any,
    readonly field: EmbeddedCollectionField,
  ) {
    super();
  }

  get documentClass(): any {
    return this.field.documentClass;
  }

  get documentName(): string {
    return this.documentClass.documentName;
  }

  get _source(): PlainObject[] {
    const source = this.model._source;
    if (!Array.isArray(source[this.name])) source[this.name] = [];
    return source[this.name];
  }

  initialize(): void {
    const seenIds = new Set<string>();
    for (const source of this._source) {
      const documentId = source._id as string;
      seenIds.add(documentId);
      const existing = super.get(documentId);
      if (existing && existing._source === source) {
        existing._initialize();
        continue;
      }
      this.#instantiate(source);
    }
    for (const documentId of Array.from(this.keys())) if (!seenIds.has(documentId)) super.delete(documentId);
  }

  /** Adds a newly created source to the parent's array and returns the constructed child. */
  _addSource(source: PlainObject): any {
    const existingIndex = this._source.findIndex((candidate) => candidate._id === source._id);
    if (existingIndex >= 0) this._source.splice(existingIndex, 1, source);
    else this._source.push(source);
    return this.#instantiate(source);
  }

  _removeSource(documentId: string): any {
    const document = super.get(documentId);
    const index = this._source.findIndex((candidate) => candidate._id === documentId);
    if (index >= 0) this._source.splice(index, 1);
    super.delete(documentId);
    return document;
  }

  toObject(): PlainObject[] {
    return this.map((document) => document.toObject());
  }

  #instantiate(source: PlainObject): any {
    try {
      const document = new this.documentClass(source, { parent: this.model });
      super.set(document.id, document);
      return document;
    } catch (error) {
      console.error(`Failed to initialize ${this.documentName} [${String(source._id)}] in ${this.model?.uuid}`, error);
      return undefined;
    }
  }
}
