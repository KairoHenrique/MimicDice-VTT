import { deepClone, diffObject, expandObject, isEmpty, parseDocumentUuid, type PlainObject } from "@tabbletop/common";
import { extractOperationOptions, SOCKET_EVENTS, type ModifyDocumentAck, type ModifyDocumentRequest, type ModifyDocumentResponse } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { serializeUpdateOperators } from "../../data/operators";
import { Hooks } from "../../hooks/Hooks";
import { currentGame, currentUi } from "../../runtime";
import type { Document, DocumentOperation } from "./Document";

const REQUEST_TIMEOUT_MS = 15_000;

type AnyDocument = Document & Record<string, any>;

export function fromUuidSync(uuid: unknown): AnyDocument | null {
  const segments = parseDocumentUuid(uuid);
  if (!segments) return null;
  const [rootSegment, ...embeddedSegments] = segments;
  let document: AnyDocument | null = currentGame()?.collections?.get(rootSegment.documentName)?.get(rootSegment.documentId) ?? null;
  for (const segment of embeddedSegments) {
    if (!document) return null;
    try {
      document = (document.getEmbeddedDocument(segment.documentName, segment.documentId) as AnyDocument) ?? null;
    } catch {
      return null;
    }
  }
  return document;
}

export async function fromUuid(uuid: unknown): Promise<AnyDocument | null> {
  return fromUuidSync(uuid);
}

function ancestorsOf(parent: AnyDocument | null): AnyDocument[] {
  const ancestors: AnyDocument[] = [];
  for (let current = parent; current; current = current.parent) ancestors.push(current);
  return ancestors;
}

export class ClientDatabaseBackend {
  constructor(private readonly socket: Socket) {}

  getFlagScopes(): string[] {
    const game = currentGame();
    const activeModuleIds = game?.modules?.filter((module: { active: boolean }) => module.active).map((module: { id: string }) => module.id) ?? [];
    return ["core", "world", game?.system?.id, ...activeModuleIds].filter(Boolean);
  }

  async create(documentClass: typeof Document, { data, parent = null, ...options }: DocumentOperation & { data: PlainObject[] }): Promise<Document[]> {
    const user = currentGame()?.user;
    const prepared: PlainObject[] = [];
    for (const rawData of data) {
      const candidate = new (documentClass as any)(deepClone(rawData), { parent }) as AnyDocument;
      if ((await candidate._preCreate(rawData, options, user)) === false) continue;
      if (Hooks.call(`preCreate${documentClass.documentName}`, candidate, rawData, options, user?.id) === false) continue;
      prepared.push(candidate.toObject());
    }
    if (prepared.length === 0) return [];
    return this.#send({ type: documentClass.documentName, action: "create", operation: { ...extractOperationOptions(options), data: prepared, parentUuid: parent?.uuid ?? null } });
  }

  async update(documentClass: typeof Document, { updates, parent = null, ...options }: DocumentOperation & { updates: PlainObject[] }): Promise<Document[]> {
    const user = currentGame()?.user;
    const collection = this.#collectionFor(documentClass.documentName, parent as AnyDocument | null);
    const prepared: PlainObject[] = [];
    for (const rawChanges of updates) {
      const document = collection?.get(rawChanges._id as string) as AnyDocument | undefined;
      if (!document) throw new Error(`${documentClass.documentName} "${String(rawChanges._id)}" does not exist`);
      const { _id: _ignored, ...requested } = expandObject(deepClone(serializeUpdateOperators(rawChanges)));
      const changes = options.diff === false ? requested : diffObject(document._source, requested, { deletionKeys: true });
      if (isEmpty(changes)) continue;
      changes._id = document.id;
      if ((await document._preUpdate(changes, options, user)) === false) continue;
      if (Hooks.call(`preUpdate${documentClass.documentName}`, document, changes, options, user?.id) === false) continue;
      prepared.push(changes);
    }
    if (prepared.length === 0) return [];
    return this.#send({ type: documentClass.documentName, action: "update", operation: { ...extractOperationOptions(options), updates: prepared, parentUuid: parent?.uuid ?? null } });
  }

  async delete(documentClass: typeof Document, { ids, parent = null, ...options }: DocumentOperation & { ids: string[] }): Promise<Document[]> {
    if (options.deleteAll === true) {
      return this.#send({ type: documentClass.documentName, action: "delete", operation: { ...extractOperationOptions(options), ids: [], deleteAll: true, parentUuid: parent?.uuid ?? null } });
    }
    const user = currentGame()?.user;
    const collection = this.#collectionFor(documentClass.documentName, parent as AnyDocument | null);
    const prepared: string[] = [];
    for (const documentId of ids) {
      const document = collection?.get(documentId) as AnyDocument | undefined;
      if (!document) continue;
      if ((await document._preDelete(options, user)) === false) continue;
      if (Hooks.call(`preDelete${documentClass.documentName}`, document, options, user?.id) === false) continue;
      prepared.push(documentId);
    }
    if (prepared.length === 0) return [];
    return this.#send({ type: documentClass.documentName, action: "delete", operation: { ...extractOperationOptions(options), ids: prepared, parentUuid: parent?.uuid ?? null } });
  }

  /** Applies a server response (own acknowledgement or another user's broadcast) to local collections. */
  handleModifyDocument(response: ModifyDocumentResponse): Document[] {
    const parentUuid = response.operation.parentUuid ?? null;
    const parent = parentUuid ? fromUuidSync(parentUuid) : null;
    if (parentUuid && !parent) return [];
    const collection = this.#collectionFor(response.type, parent);
    if (!collection) return [];
    const options: DocumentOperation = { ...response.operation, parent };
    switch (response.action) {
      case "create":
        return this.#applyCreate(collection, parent, response.result as PlainObject[], options, response.userId);
      case "update":
        return this.#applyUpdate(collection, parent, response.result as PlainObject[], options, response.userId);
      case "delete":
        return this.#applyDelete(collection, parent, response.result as string[], options, response.userId);
    }
  }

  async #send(request: ModifyDocumentRequest): Promise<Document[]> {
    const acknowledgement = (await this.socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.MODIFY_DOCUMENT, request)) as ModifyDocumentAck;
    if (!acknowledgement?.response) {
      const message = acknowledgement?.error ?? "Falha ao salvar o documento";
      currentUi()?.notifications?.error(message);
      throw new Error(message);
    }
    return this.handleModifyDocument(acknowledgement.response);
  }

  #collectionFor(documentName: string, parent: AnyDocument | null): any {
    if (!parent) return currentGame()?.collections?.get(documentName);
    try {
      return parent.getEmbeddedCollection(documentName);
    } catch {
      return undefined;
    }
  }

  #applyCreate(collection: any, parent: AnyDocument | null, sources: PlainObject[], options: DocumentOperation, userId: string): Document[] {
    const created: AnyDocument[] = [];
    for (const source of sources) {
      const document = parent ? collection._addSource(source) : this.#instantiateWorldDocument(collection, source);
      if (document) created.push(document);
    }
    for (const document of created) {
      document._onCreate(document._source, options, userId);
      Hooks.callAll(`create${document.documentName}`, document, options, userId);
    }
    this.#notifyAncestors(parent, "_onCreateDescendantDocuments", collection, created, sources, options, userId);
    if (!parent) collection.render(false);
    return created;
  }

  #applyUpdate(collection: any, parent: AnyDocument | null, changes: PlainObject[], options: DocumentOperation, userId: string): Document[] {
    const updated: Array<[AnyDocument, PlainObject]> = [];
    for (const change of changes) {
      const document = collection.get(change._id) as AnyDocument | undefined;
      if (!document) continue;
      const { _id: _ignored, ...diff } = change;
      document.updateSource(diff);
      updated.push([document, change]);
    }
    for (const [document, change] of updated) {
      document._onUpdate(change, options, userId);
      Hooks.callAll(`update${document.documentName}`, document, change, options, userId);
    }
    const documents = updated.map(([document]) => document);
    this.#notifyAncestors(parent, "_onUpdateDescendantDocuments", collection, documents, changes, options, userId);
    if (!parent) collection.render(false);
    return documents;
  }

  #applyDelete(collection: any, parent: AnyDocument | null, ids: string[], options: DocumentOperation, userId: string): Document[] {
    const deleted: AnyDocument[] = [];
    for (const documentId of ids) {
      const document = parent ? collection._removeSource(documentId) : collection.get(documentId);
      if (!document) continue;
      if (!parent) collection.delete(documentId);
      deleted.push(document);
    }
    for (const document of deleted) {
      document._onDelete(options, userId);
      Hooks.callAll(`delete${document.documentName}`, document, options, userId);
    }
    this.#notifyAncestors(parent, "_onDeleteDescendantDocuments", collection, deleted, ids, options, userId);
    if (!parent) collection.render(false);
    return deleted;
  }

  #instantiateWorldDocument(collection: any, source: PlainObject): AnyDocument | undefined {
    const previous = collection.get(source._id);
    if (previous) for (const app of Object.values(previous.apps ?? {})) void (app as { close?(options: object): unknown }).close?.({ submit: false });
    try {
      const document = new collection.documentClass(source) as AnyDocument;
      collection.set(document.id, document);
      return document;
    } catch (error) {
      Hooks.onError("ClientDatabaseBackend#create", error, { msg: `Failed to create ${collection.documentName}`, log: "error" });
      return undefined;
    }
  }

  #notifyAncestors(parent: AnyDocument | null, method: string, collection: any, documents: AnyDocument[], data: unknown[], options: DocumentOperation, userId: string): void {
    if (!parent || documents.length === 0) return;
    const ancestors = ancestorsOf(parent);
    for (const ancestor of ancestors) ancestor[method](parent, collection.name, documents, data, options, userId);
    ancestors[ancestors.length - 1]._safePrepareData?.();
  }
}
