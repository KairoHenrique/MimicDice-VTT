import {
  DOCUMENT_OWNERSHIP_LEVELS,
  effectiveOwnershipLevel,
  isGameMasterRole,
  roleHasPermission,
  type ConfiguredPermissions,
  worldDocumentType,
  type DocumentTypeDefinition,
  type UserPermissionName,
} from "@tabbletop/common";
import type { DocumentSource } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { DocumentNode } from "./documentTree";

const PLACEMENT_KEYS = new Set(["x", "y", "c", "rotation", "width", "height", "elevation"]);

export interface DocumentActor {
  userId: string;
  role: number;
}

export class DocumentPermissionPolicy {
  constructor(
    private readonly readConfiguredPermissions: () => ConfiguredPermissions,
    private readonly findActor: (actorId: string) => DocumentSource | undefined = () => undefined,
    private readonly isMapLocked: () => boolean = () => false,
  ) {}

  isGameMaster(actor: DocumentActor): boolean {
    return isGameMasterRole(actor.role);
  }

  /** While the GM keeps the map locked, players cannot create, move or delete anything inside a scene. */
  assertMapUnlocked(actor: DocumentActor, ancestors: readonly DocumentNode[]): void {
    if (ancestors[0]?.definition.name !== "Scene" || this.isGameMaster(actor) || !this.isMapLocked()) return;
    throw HttpError.forbidden("O mestre travou o mapa");
  }

  /** Objects the GM pinned in place (`locked`) stay put for players, even on tokens they own. */
  assertNotPinned(actor: DocumentActor, existing: DocumentSource, changes: Record<string, unknown>): void {
    if (existing.locked !== true || this.isGameMaster(actor)) return;
    if (Object.keys(changes).some((key) => PLACEMENT_KEYS.has(key))) throw HttpError.forbidden("O mestre travou este objeto no lugar");
  }

  /** Ownership level the actor holds over a document, resolving INHERIT through its ancestors. */
  ownershipLevel(
    actor: DocumentActor,
    definition: DocumentTypeDefinition,
    source: DocumentSource,
    ancestors: readonly DocumentNode[] = [],
    { includeLinkedActor = true }: { includeLinkedActor?: boolean } = {},
  ): number {
    const viewer = { userId: actor.userId, isGameMaster: this.isGameMaster(actor) };
    let inheritedLevel: number | undefined;
    for (const ancestor of ancestors) {
      inheritedLevel = effectiveOwnershipLevel(ancestor.definition, ancestor.source, viewer, inheritedLevel);
    }
    const ownLevel = effectiveOwnershipLevel(definition, source, viewer, inheritedLevel);
    return includeLinkedActor ? Math.max(ownLevel, this.#linkedActorLevel(actor, definition, source)) : ownLevel;
  }

  /** A token's controller is whoever owns its actor (and can still see the token's scene). */
  #linkedActorLevel(actor: DocumentActor, definition: DocumentTypeDefinition, source: DocumentSource): number {
    const field = definition.ownershipFromActorField;
    const actorId = field ? source[field] : undefined;
    if (typeof actorId !== "string") return DOCUMENT_OWNERSHIP_LEVELS.NONE;
    const linkedActor = this.findActor(actorId);
    const actorDefinition = worldDocumentType("Actor");
    if (!linkedActor || !actorDefinition) return DOCUMENT_OWNERSHIP_LEVELS.NONE;
    return effectiveOwnershipLevel(actorDefinition, linkedActor, { userId: actor.userId, isGameMaster: this.isGameMaster(actor) });
  }

  hasCreatePermission(actor: DocumentActor, definition: DocumentTypeDefinition): boolean {
    const permission = definition.createPermission;
    if (permission === "ANYONE") return true;
    if (permission === "ASSISTANT") return this.isGameMaster(actor);
    return roleHasPermission(actor.role, permission as UserPermissionName, this.readConfiguredPermissions());
  }

  assertCanCreateWorldDocument(actor: DocumentActor, definition: DocumentTypeDefinition): void {
    if (!this.hasCreatePermission(actor, definition)) throw HttpError.forbidden(`Sem permissão para criar ${definition.name}`);
  }

  assertOwner(actor: DocumentActor, definition: DocumentTypeDefinition, source: DocumentSource, ancestors: readonly DocumentNode[] = []): void {
    if (this.ownershipLevel(actor, definition, source, ancestors) < DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      throw HttpError.forbidden(`Sem permissão para modificar ${definition.name}`);
    }
  }

  assertCanDelete(actor: DocumentActor, definition: DocumentTypeDefinition, source: DocumentSource, ancestors: readonly DocumentNode[] = []): void {
    if (definition.deletePermission === "ASSISTANT" && !this.isGameMaster(actor)) {
      throw HttpError.forbidden(`Sem permissão para excluir ${definition.name}`);
    }
    if (this.ownershipLevel(actor, definition, source, ancestors, { includeLinkedActor: false }) < DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
      throw HttpError.forbidden(`Sem permissão para excluir ${definition.name}`);
    }
  }

  assertMayChangeOwnership(actor: DocumentActor, changes: Record<string, unknown>): void {
    const touchesOwnership = Object.keys(changes).some((key) => key === "ownership" || key === "-=ownership");
    if (touchesOwnership && !this.isGameMaster(actor)) throw HttpError.forbidden("Apenas o mestre altera a visibilidade");
  }
}
