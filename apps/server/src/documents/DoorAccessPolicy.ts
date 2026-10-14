import {
  DOCUMENT_OWNERSHIP_LEVELS,
  DOOR_STATES,
  WALL_DOOR_TYPE_NONE,
  effectiveOwnershipLevel,
  itemNamesMatch,
  requiredDoorItem,
  roleHasPermission,
  worldDocumentType,
  type ConfiguredPermissions,
  type DocumentTypeDefinition,
  type PlainObject,
} from "@tabbletop/common";
import type { DocumentSource } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { DocumentActor, DocumentPermissionPolicy } from "./DocumentPermissionPolicy";
import { isDoorSeen, tokenEye } from "./doorSight";

const DOOR_OPERATION_KEYS = new Set(["_id", "ds"]);

/**
 * Players never own walls, yet they may open and close doors: only the `ds` field, only between open and
 * closed, never a locked door, and only while one of their characters carries the door's key item.
 */
export class DoorAccessPolicy {
  constructor(
    private readonly permissions: DocumentPermissionPolicy,
    private readonly readConfiguredPermissions: () => ConfiguredPermissions,
    private readonly listActors: () => Iterable<DocumentSource>,
  ) {}

  isDoorOperation(definition: DocumentTypeDefinition, existing: DocumentSource, changes: PlainObject): boolean {
    if (definition.name !== "Wall" || Number(existing.door) === WALL_DOOR_TYPE_NONE) return false;
    if (!Object.keys(changes).every((key) => DOOR_OPERATION_KEYS.has(key))) return false;
    return changes.ds === DOOR_STATES.OPEN || changes.ds === DOOR_STATES.CLOSED;
  }

  assertMayOperateDoor(actor: DocumentActor, wall: DocumentSource, scene: DocumentSource | null = null): void {
    if (this.permissions.isGameMaster(actor)) return;
    if (!roleHasPermission(actor.role, "WALL_DOORS", this.readConfiguredPermissions())) throw HttpError.forbidden("Sem permissão para usar portas");
    if (Number(wall.ds) === DOOR_STATES.LOCKED) throw HttpError.forbidden("Trancada pelo mestre: só abre quando o mestre destrancar");
    if (scene && !this.#seesDoor(actor, wall, scene)) throw HttpError.forbidden("Você não vê esta porta");
    const requiredItem = requiredDoorItem(wall);
    if (requiredItem && !this.#carriesItem(actor, requiredItem)) throw HttpError.forbidden(`Trancada a chave: você precisa de "${requiredItem}" para abrir`);
  }

  /** With token vision on, a player reaches only doors one of their tokens can see; without it the whole map is in view. */
  #seesDoor(actor: DocumentActor, wall: DocumentSource, scene: DocumentSource): boolean {
    if (scene.tokenVision !== true) return true;
    const gridSize = Number((scene.grid as PlainObject | undefined)?.size) || 0;
    const ownedActorIds = this.#ownedActorIds(actor);
    const tokens = Array.isArray(scene.tokens) ? (scene.tokens as PlainObject[]) : [];
    const eyes = tokens.filter((token) => typeof token.actorId === "string" && ownedActorIds.has(token.actorId)).flatMap((token) => tokenEye(token, gridSize) ?? []);
    const walls = Array.isArray(scene.walls) ? (scene.walls as PlainObject[]) : [];
    return isDoorSeen(wall, eyes, walls);
  }

  #ownedActorIds(actor: DocumentActor): Set<string> {
    const actorDefinition = worldDocumentType("Actor");
    const owned = new Set<string>();
    if (!actorDefinition) return owned;
    const viewer = { userId: actor.userId, isGameMaster: false };
    for (const character of this.listActors()) {
      if (effectiveOwnershipLevel(actorDefinition, character, viewer) >= DOCUMENT_OWNERSHIP_LEVELS.OWNER) owned.add(character._id);
    }
    return owned;
  }

  #carriesItem(actor: DocumentActor, requiredItem: string): boolean {
    const actorDefinition = worldDocumentType("Actor");
    if (!actorDefinition) return false;
    const viewer = { userId: actor.userId, isGameMaster: false };
    for (const character of this.listActors()) {
      if (effectiveOwnershipLevel(actorDefinition, character, viewer) < DOCUMENT_OWNERSHIP_LEVELS.OWNER) continue;
      const items = Array.isArray(character.items) ? (character.items as PlainObject[]) : [];
      if (items.some((item) => itemNamesMatch(item?.name, requiredItem))) return true;
    }
    return false;
  }
}
