import {
  DOCUMENT_OWNERSHIP_LEVELS,
  deepClone,
  worldDocumentType,
  type DocumentTypeDefinition,
  type PlainObject,
} from "@tabbletop/common";
import { extractOperationOptions, type DocumentSource, type ModifyDocumentRequest, type ModifyDocumentResponse } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { DocumentActor, DocumentPermissionPolicy } from "./DocumentPermissionPolicy";
import type { DocumentSourceValidator } from "./DocumentSourceValidator";
import type { DoorAccessPolicy } from "./DoorAccessPolicy";
import type { DocumentStore } from "./DocumentStore";
import { embeddedCollection, resolveEmbeddedTarget, resolveParentChain, type DocumentNode } from "./documentTree";

export interface AffectedDocument {
  before: DocumentSource | null;
  after: DocumentSource | null;
  changes?: PlainObject;
}

export interface ModificationOutcome {
  response: ModifyDocumentResponse;
  definition: DocumentTypeDefinition;
  /** Ancestors after the change (world document first); empty for world-level operations. */
  ancestors: DocumentNode[];
  affected: AffectedDocument[];
}

interface OperationTarget {
  definition: DocumentTypeDefinition;
  ancestors: DocumentNode[];
  /** Live array (world collection view or the embedded array inside the working root copy). */
  siblings: () => DocumentSource[];
  commit: () => Promise<void>;
  isTakenId: (documentId: string) => boolean;
  findById: (documentId: string) => DocumentSource | undefined;
  replace: (source: DocumentSource) => void;
  insert: (source: DocumentSource) => void;
  remove: (documentId: string) => void;
}

export class DocumentService {
  readonly #storesByCollection: Map<string, DocumentStore>;

  constructor(
    stores: readonly DocumentStore[],
    private readonly validator: DocumentSourceValidator,
    private readonly permissions: DocumentPermissionPolicy,
    private readonly doorAccess: DoorAccessPolicy,
  ) {
    this.#storesByCollection = new Map(stores.map((store) => [store.collectionName, store]));
  }

  listCollection(collectionName: string): DocumentSource[] {
    return Array.from(this.#storesByCollection.get(collectionName)?.values() ?? []);
  }

  collectionNames(): string[] {
    return Array.from(this.#storesByCollection.keys());
  }

  async flush(): Promise<void> {
    await Promise.all(Array.from(this.#storesByCollection.values(), (store) => store.flush()));
  }

  /**
   * For live drag previews: the token exists on the scene and the actor could move it right now
   * (ownership, map lock, scene pause and pinned objects). Reads the stored scene without copying it.
   */
  inspectTokenMove(actor: DocumentActor, sceneId: string, tokenId: string): { hidden: boolean } | null {
    try {
      const lookup = (collectionName: string, documentId: string) => this.#storesByCollection.get(collectionName)?.get(documentId);
      const { ancestors } = resolveParentChain(`Scene.${sceneId}`, lookup);
      const scene = ancestors[ancestors.length - 1];
      const { definition, fieldName } = resolveEmbeddedTarget(scene, "Token");
      const tokens = scene.source[fieldName];
      const token = Array.isArray(tokens) ? (tokens as DocumentSource[]).find((candidate) => candidate._id === tokenId) : undefined;
      if (!token) return null;
      this.permissions.assertMapUnlocked(actor, ancestors);
      this.permissions.assertOwnerOrMayMove(actor, definition, token, { _id: token._id, x: token.x, y: token.y }, ancestors);
      this.permissions.assertNotPinned(actor, token, { x: token.x, y: token.y });
      return { hidden: token.hidden === true };
    } catch {
      return null;
    }
  }

  async modify(request: ModifyDocumentRequest, actor: DocumentActor): Promise<ModificationOutcome> {
    const parentUuid = request.operation.parentUuid ?? null;
    const target = parentUuid ? this.#embeddedTarget(request.type, parentUuid) : this.#worldTarget(request.type);
    const affected = this.#applyAction(request, target, actor);
    await target.commit();
    return {
      response: {
        type: target.definition.name,
        action: request.action,
        userId: actor.userId,
        operation: { ...extractOperationOptions(request.operation), parentUuid },
        result: resultFor(request.action, affected),
      },
      definition: target.definition,
      ancestors: target.ancestors,
      affected,
    };
  }

  #applyAction(request: ModifyDocumentRequest, target: OperationTarget, actor: DocumentActor): AffectedDocument[] {
    const author = { userId: actor.userId, isGameMaster: this.permissions.isGameMaster(actor) };
    this.permissions.assertMapUnlocked(actor, target.ancestors);
    switch (request.action) {
      case "create":
        return this.#create(target, request.operation.data ?? [], actor, author, request.operation.keepId === true);
      case "update":
        return this.#update(target, request.operation.updates ?? [], actor, author);
      case "delete":
        return this.#delete(target, request.operation.ids ?? [], actor, this.#mayDeleteAll(request, target, actor));
    }
  }

  /** Embedded deleteAll is bounded by parent ownership; clearing a whole world collection is a GM action. */
  #mayDeleteAll(request: ModifyDocumentRequest, target: OperationTarget, actor: DocumentActor): boolean {
    if (request.operation.deleteAll !== true) return false;
    if (target.ancestors.length > 0 || this.permissions.isGameMaster(actor)) return true;
    throw HttpError.forbidden("Somente o mestre pode apagar todos os documentos");
  }

  #create(target: OperationTarget, data: PlainObject[], actor: DocumentActor, author: { userId: string; isGameMaster: boolean }, keepId: boolean): AffectedDocument[] {
    if (target.ancestors.length === 0) this.permissions.assertCanCreateWorldDocument(actor, target.definition);
    else this.#assertMayCreateEmbedded(actor, target);
    const idsInBatch = new Set<string>();
    const isTakenId = (documentId: string) => idsInBatch.has(documentId) || target.isTakenId(documentId);
    const created = data.map((rawData) => {
      const source = this.validator.prepareCreate(target.definition, rawData, author, { keepId, isTakenId });
      this.permissions.assertActorChangeAllowed(actor, target.definition, null, source);
      idsInBatch.add(source._id);
      return source;
    });
    for (const source of created) target.insert(source);
    return created.map((source) => ({ before: null, after: source }));
  }

  #update(target: OperationTarget, updates: PlainObject[], actor: DocumentActor, author: { userId: string; isGameMaster: boolean }): AffectedDocument[] {
    const prepared = updates.map((rawChanges) => {
      const existing = this.#requireExisting(target, rawChanges._id);
      if (this.doorAccess.isDoorOperation(target.definition, existing, rawChanges)) this.doorAccess.assertMayOperateDoor(actor, existing);
      else this.permissions.assertOwnerOrMayMove(actor, target.definition, existing, rawChanges, target.ancestors);
      this.permissions.assertNotPinned(actor, existing, rawChanges);
      this.permissions.assertAuthoredNotLocked(actor, target.definition, existing);
      const result = this.validator.prepareUpdate(target.definition, existing, rawChanges, author);
      this.permissions.assertMayChangeOwnership(actor, result.changes);
      this.permissions.assertActorChangeAllowed(actor, target.definition, existing, result.source);
      return { before: deepClone(existing), after: result.source, changes: result.changes };
    });
    for (const entry of prepared) target.replace(entry.after);
    return [...prepared, ...this.#releaseExclusiveFlag(target, prepared, author)];
  }

  /** Turning on an exclusive flag (the active scene) turns it off on every sibling, in the same operation. */
  #releaseExclusiveFlag(target: OperationTarget, prepared: AffectedDocument[], author: { userId: string; isGameMaster: boolean }): AffectedDocument[] {
    const field = target.definition.exclusiveWhenField;
    const claimed = field ? prepared.find((entry) => entry.changes?.[field] === true && entry.after?.[field] === true) : undefined;
    if (!field || !claimed) return [];
    const released: AffectedDocument[] = [];
    for (const sibling of target.siblings()) {
      if (sibling._id === claimed.after?._id || sibling[field] !== true) continue;
      const result = this.validator.prepareUpdate(target.definition, sibling, { _id: sibling._id, [field]: false }, author);
      released.push({ before: deepClone(sibling), after: result.source, changes: result.changes });
    }
    for (const entry of released) target.replace(entry.after as DocumentSource);
    return released;
  }

  #delete(target: OperationTarget, ids: string[], actor: DocumentActor, deleteAll: boolean): AffectedDocument[] {
    const idsToDelete = deleteAll ? target.siblings().map((sibling) => sibling._id) : ids;
    const existing = Array.from(new Set(idsToDelete), (documentId) => this.#requireExisting(target, documentId));
    for (const source of existing) {
      this.permissions.assertCanDelete(actor, target.definition, source, target.ancestors);
      this.permissions.assertAuthoredNotLocked(actor, target.definition, source);
    }
    for (const source of existing) target.remove(source._id);
    return existing.map((source) => ({ before: source, after: null }));
  }

  #requireExisting(target: OperationTarget, documentId: unknown): DocumentSource {
    const existing = typeof documentId === "string" ? target.findById(documentId) : undefined;
    if (!existing) throw HttpError.notFound(`${target.definition.name} não encontrado`);
    return existing;
  }

  /** Authored placeables (drawings, templates) only need the create permission and a parent the user can see. */
  #assertMayCreateEmbedded(actor: DocumentActor, target: OperationTarget): void {
    const { definition, ancestors } = target;
    if (definition.accessModel === "authored" && this.permissions.hasCreatePermission(actor, definition)) {
      const parent = ancestors[ancestors.length - 1];
      const parentLevel = this.permissions.ownershipLevel(actor, parent.definition, parent.source, ancestors.slice(0, -1));
      if (parentLevel >= DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) return;
    }
    this.#assertOwnsDirectParent(actor, ancestors);
  }

  #assertOwnsDirectParent(actor: DocumentActor, ancestors: DocumentNode[]): void {
    const parent = ancestors[ancestors.length - 1];
    this.permissions.assertOwner(actor, parent.definition, parent.source, ancestors.slice(0, -1));
  }

  #storeFor(definition: DocumentTypeDefinition): DocumentStore {
    const store = this.#storesByCollection.get(definition.collection);
    if (!store) throw HttpError.badRequest(`Tipo de documento não suportado: ${definition.name}`);
    return store;
  }

  #worldTarget(documentName: string): OperationTarget {
    const definition = worldDocumentType(documentName);
    if (!definition) throw HttpError.badRequest(`Tipo de documento não suportado: ${documentName.slice(0, 40)}`);
    const store = this.#storeFor(definition);
    const pendingWrites: Promise<void>[] = [];
    return {
      definition,
      ancestors: [],
      siblings: () => Array.from(store.values()),
      commit: async () => void (await Promise.all(pendingWrites)),
      isTakenId: (documentId) => store.has(documentId),
      findById: (documentId) => store.get(documentId),
      replace: (source) => void pendingWrites.push(store.set(source)),
      insert: (source) => void pendingWrites.push(store.set(source)),
      remove: (documentId) => void pendingWrites.push(store.remove(documentId)),
    };
  }

  /** Embedded changes are applied to a working copy of the world document, which replaces the stored one on commit. */
  #embeddedTarget(documentName: string, parentUuid: string): OperationTarget {
    const lookup = (collectionName: string, documentId: string) => this.#storesByCollection.get(collectionName)?.get(documentId);
    const { rootCollection, ancestors: liveAncestors } = resolveParentChain(parentUuid, lookup);
    const workingRoot = deepClone(liveAncestors[0].source);
    const { ancestors } = resolveParentChain(parentUuid, lookup, workingRoot);
    const { definition, fieldName } = resolveEmbeddedTarget(ancestors[ancestors.length - 1], documentName);
    const siblings = () => embeddedCollection(ancestors[ancestors.length - 1].source, fieldName);
    const store = this.#storesByCollection.get(rootCollection) as DocumentStore;
    let touched = false;
    return {
      definition,
      ancestors,
      siblings,
      commit: async () => {
        if (touched) await store.set(workingRoot);
      },
      isTakenId: (documentId) => siblings().some((sibling) => sibling._id === documentId),
      findById: (documentId) => siblings().find((sibling) => sibling._id === documentId),
      replace: (source) => {
        const list = siblings();
        list[list.findIndex((sibling) => sibling._id === source._id)] = source;
        touched = true;
      },
      insert: (source) => {
        siblings().push(source);
        touched = true;
      },
      remove: (documentId) => {
        const list = siblings();
        list.splice(list.findIndex((sibling) => sibling._id === documentId), 1);
        touched = true;
      },
    };
  }
}

function resultFor(action: ModifyDocumentRequest["action"], affected: AffectedDocument[]): ModifyDocumentResponse["result"] {
  if (action === "create") return affected.map((entry) => entry.after as DocumentSource);
  if (action === "update") return affected.map((entry) => entry.changes as PlainObject);
  return affected.map((entry) => (entry.before as DocumentSource)._id);
}
