import type { UserPermissionName } from "./permissions";

export type DeletePermission = "ASSISTANT" | "OWNER";

/** "ownership" uses the per-user ownership map; "authored" grants control to the author and visibility through whispers. */
export type DocumentAccessModel = "ownership" | "authored";

export interface DocumentTypeDefinition {
  name: string;
  collection: string;
  embedded: Readonly<Record<string, string>>;
  hasOwnership: boolean;
  hasTypeData: boolean;
  accessModel: DocumentAccessModel;
  createPermission: UserPermissionName | "ASSISTANT" | "ANYONE";
  deletePermission: DeletePermission;
  /** Fields a LIMITED viewer receives; everything else is withheld by the server. */
  limitedFields: readonly string[];
  /** Paths whose string values are sanitized as HTML before storage. */
  htmlFields: readonly string[];
  /** Boolean field that, when true, grants every user at least OBSERVER (the active scene). */
  publicWhenField?: string;
  /** Boolean field that, when true, hides the document from everyone but GMs (hidden tokens, tiles...). */
  gmOnlyWhenField?: string;
  /** Field holding an Actor id whose owners also own this document (tokens follow their actor). */
  ownershipFromActorField?: string;
  /** Top-level fields only a GM may change, even on documents a player owns. */
  gmOnlyFields?: readonly string[];
  /** Boolean field at most one sibling may have set (the active scene). */
  exclusiveWhenField?: string;
}

const BASE_LIMITED_FIELDS = ["_id", "name", "type", "img", "ownership", "folder", "sort"] as const;

const SCENE_EMBEDDED_COLLECTIONS = {
  Token: "tokens",
  Tile: "tiles",
  Wall: "walls",
  AmbientLight: "lights",
  Note: "notes",
  Drawing: "drawings",
  MeasuredTemplate: "templates",
} as const;

/** Scene placeables inherit the scene's ownership; only GMs edit them unless a rule below says otherwise. */
function scenePlaceable(name: string, collection: string, overrides: Partial<DocumentTypeDefinition> = {}): DocumentTypeDefinition {
  return {
    name,
    collection,
    embedded: {},
    hasOwnership: false,
    hasTypeData: false,
    accessModel: "ownership",
    createPermission: "ASSISTANT",
    deletePermission: "OWNER",
    limitedFields: [],
    htmlFields: [],
    ...overrides,
  };
}

export const WORLD_DOCUMENT_TYPES: Readonly<Record<string, DocumentTypeDefinition>> = Object.freeze({
  Actor: {
    name: "Actor",
    collection: "actors",
    embedded: { Item: "items", ActiveEffect: "effects" },
    hasOwnership: true,
    hasTypeData: true,
    accessModel: "ownership",
    createPermission: "ACTOR_CREATE",
    deletePermission: "OWNER",
    limitedFields: [...BASE_LIMITED_FIELDS, "prototypeToken"],
    htmlFields: [],
  },
  Item: {
    name: "Item",
    collection: "items",
    embedded: { ActiveEffect: "effects" },
    hasOwnership: true,
    hasTypeData: true,
    accessModel: "ownership",
    createPermission: "ITEM_CREATE",
    deletePermission: "OWNER",
    limitedFields: BASE_LIMITED_FIELDS,
    htmlFields: [],
  },
  JournalEntry: {
    name: "JournalEntry",
    collection: "journal",
    embedded: { JournalEntryPage: "pages" },
    hasOwnership: true,
    hasTypeData: false,
    accessModel: "ownership",
    createPermission: "JOURNAL_CREATE",
    deletePermission: "OWNER",
    limitedFields: ["_id", "name", "ownership", "folder", "sort"],
    htmlFields: [],
  },
  Folder: {
    name: "Folder",
    collection: "folders",
    embedded: {},
    hasOwnership: false,
    hasTypeData: false,
    accessModel: "ownership",
    createPermission: "ASSISTANT",
    deletePermission: "ASSISTANT",
    limitedFields: ["_id", "name", "type", "folder", "sort", "sorting", "color"],
    htmlFields: ["description"],
  },
  ChatMessage: {
    name: "ChatMessage",
    collection: "messages",
    embedded: {},
    hasOwnership: false,
    hasTypeData: false,
    accessModel: "authored",
    createPermission: "ANYONE",
    deletePermission: "OWNER",
    /** What the author of a blind roll receives: the message exists, the results do not. */
    limitedFields: ["_id", "type", "style", "author", "speaker", "timestamp", "whisper", "blind", "sound", "emote"],
    htmlFields: ["content", "flavor"],
  },
  Scene: {
    name: "Scene",
    collection: "scenes",
    embedded: SCENE_EMBEDDED_COLLECTIONS,
    hasOwnership: true,
    hasTypeData: false,
    accessModel: "ownership",
    createPermission: "ASSISTANT",
    deletePermission: "ASSISTANT",
    limitedFields: ["_id", "name", "navName", "navigation", "navOrder", "active", "thumb", "ownership", "folder", "sort"],
    htmlFields: [],
    publicWhenField: "active",
    exclusiveWhenField: "active",
  },
});

export const EMBEDDED_DOCUMENT_TYPES: Readonly<Record<string, DocumentTypeDefinition>> = Object.freeze({
  Item: { ...WORLD_DOCUMENT_TYPES.Item, hasOwnership: false },
  ActiveEffect: {
    name: "ActiveEffect",
    collection: "effects",
    embedded: {},
    hasOwnership: false,
    hasTypeData: true,
    accessModel: "ownership",
    createPermission: "ASSISTANT",
    deletePermission: "OWNER",
    limitedFields: [],
    htmlFields: ["description"],
  },
  JournalEntryPage: {
    name: "JournalEntryPage",
    collection: "pages",
    embedded: {},
    hasOwnership: true,
    hasTypeData: true,
    accessModel: "ownership",
    createPermission: "ASSISTANT",
    deletePermission: "OWNER",
    limitedFields: [],
    htmlFields: ["text.content"],
  },
  Token: scenePlaceable("Token", "tokens", {
    gmOnlyWhenField: "hidden",
    ownershipFromActorField: "actorId",
    gmOnlyFields: ["actorId", "actorLink", "hidden", "disposition", "locked"],
  }),
  Tile: scenePlaceable("Tile", "tiles", { gmOnlyWhenField: "hidden" }),
  Wall: scenePlaceable("Wall", "walls"),
  AmbientLight: scenePlaceable("AmbientLight", "lights", { gmOnlyWhenField: "hidden" }),
  Note: scenePlaceable("Note", "notes"),
  /** Players may sketch and place templates; the author owns them. */
  Drawing: scenePlaceable("Drawing", "drawings", { accessModel: "authored", createPermission: "DRAWING_CREATE", gmOnlyWhenField: "hidden" }),
  MeasuredTemplate: scenePlaceable("MeasuredTemplate", "templates", { accessModel: "authored", createPermission: "TEMPLATE_CREATE", gmOnlyWhenField: "hidden" }),
});

export function worldDocumentType(documentName: string): DocumentTypeDefinition | undefined {
  return Object.hasOwn(WORLD_DOCUMENT_TYPES, documentName) ? WORLD_DOCUMENT_TYPES[documentName] : undefined;
}

export function embeddedDocumentType(documentName: string): DocumentTypeDefinition | undefined {
  return Object.hasOwn(EMBEDDED_DOCUMENT_TYPES, documentName) ? EMBEDDED_DOCUMENT_TYPES[documentName] : undefined;
}

export function worldDocumentTypeForCollection(collectionName: string): DocumentTypeDefinition | undefined {
  return Object.values(WORLD_DOCUMENT_TYPES).find((definition) => definition.collection === collectionName);
}
