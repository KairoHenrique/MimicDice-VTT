import { embeddedDocumentType, type DocumentTypeDefinition } from "./documentTypes";
import { deepClone, type PlainObject } from "./objectUtils";
import { DOCUMENT_OWNERSHIP_LEVELS, resolveOwnershipLevel, type OwnershipMap } from "./permissions";
import { redactSecretsForOwnership } from "./secretSections";

export const VIEW_LEVELS = Object.freeze({ HIDDEN: 0, LIMITED: 1, FULL: 2 });

export type ViewLevel = (typeof VIEW_LEVELS)[keyof typeof VIEW_LEVELS];

export interface Viewer {
  userId: string;
  isGameMaster: boolean;
}

function isAuthor(source: PlainObject, viewer: Viewer): boolean {
  return typeof source.author === "string" && source.author === viewer.userId;
}

function whisperRecipients(source: PlainObject): string[] {
  return Array.isArray(source.whisper) ? source.whisper.filter((recipient): recipient is string => typeof recipient === "string") : [];
}

/** Public messages reach everyone; whispers reach recipients, the author and GMs; blind results are hidden from the author. */
function authoredViewLevel(source: PlainObject, viewer: Viewer): ViewLevel {
  if (viewer.isGameMaster) return VIEW_LEVELS.FULL;
  const recipients = whisperRecipients(source);
  const authoredByViewer = isAuthor(source, viewer);
  if (source.blind === true && authoredByViewer && !recipients.includes(viewer.userId)) return VIEW_LEVELS.LIMITED;
  if (recipients.length === 0 || recipients.includes(viewer.userId) || authoredByViewer) return VIEW_LEVELS.FULL;
  return VIEW_LEVELS.HIDDEN;
}

function authoredOwnershipLevel(source: PlainObject, viewer: Viewer): number {
  if (viewer.isGameMaster || isAuthor(source, viewer)) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return authoredViewLevel(source, viewer) === VIEW_LEVELS.FULL ? DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : DOCUMENT_OWNERSHIP_LEVELS.NONE;
}

function ownershipLevelFor(definition: DocumentTypeDefinition, source: PlainObject, viewer: Viewer, parentOwnershipLevel: number): number {
  if (definition.accessModel === "authored") return authoredOwnershipLevel(source, viewer);
  if (!definition.hasOwnership) return viewer.isGameMaster ? DOCUMENT_OWNERSHIP_LEVELS.OWNER : parentOwnershipLevel;
  const level = resolveOwnershipLevel(source.ownership as OwnershipMap | undefined, viewer.userId, viewer.isGameMaster, parentOwnershipLevel);
  if (definition.publicWhenField && source[definition.publicWhenField] === true) return Math.max(level, DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
  return level;
}

function isGameMasterOnly(definition: DocumentTypeDefinition, source: PlainObject, viewer: Viewer): boolean {
  return !viewer.isGameMaster && definition.gmOnlyWhenField !== undefined && source[definition.gmOnlyWhenField] === true;
}

/** How much of a document the viewer may receive. Embedded documents are only visible to viewers who see their parent in full. */
export function viewLevelFor(definition: DocumentTypeDefinition, source: PlainObject, viewer: Viewer, parentOwnershipLevel?: number): ViewLevel {
  if (definition.name === "Folder") return VIEW_LEVELS.FULL;
  if (isGameMasterOnly(definition, source, viewer)) return VIEW_LEVELS.HIDDEN;
  if (definition.accessModel === "authored") return authoredViewLevel(source, viewer);
  const isEmbedded = parentOwnershipLevel !== undefined;
  const level = ownershipLevelFor(definition, source, viewer, parentOwnershipLevel ?? DOCUMENT_OWNERSHIP_LEVELS.NONE);
  if (level >= DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) return VIEW_LEVELS.FULL;
  if (level >= DOCUMENT_OWNERSHIP_LEVELS.LIMITED && !isEmbedded) return VIEW_LEVELS.LIMITED;
  return VIEW_LEVELS.HIDDEN;
}

export function effectiveOwnershipLevel(definition: DocumentTypeDefinition, source: PlainObject, viewer: Viewer, parentOwnershipLevel?: number): number {
  return ownershipLevelFor(definition, source, viewer, parentOwnershipLevel ?? DOCUMENT_OWNERSHIP_LEVELS.NONE);
}

function pickFields(source: PlainObject, fields: readonly string[]): PlainObject {
  const picked: PlainObject = {};
  for (const field of fields) {
    if (field in source) picked[field] = deepClone(source[field]);
  }
  return picked;
}

function redactEmbeddedCollections(definition: DocumentTypeDefinition, source: PlainObject, viewer: Viewer, ownershipLevel: number): PlainObject {
  const redacted = deepClone(source);
  for (const [embeddedName, fieldName] of Object.entries(definition.embedded)) {
    const embeddedDefinition = embeddedDocumentType(embeddedName);
    const children = source[fieldName];
    if (!embeddedDefinition || !Array.isArray(children)) continue;
    redacted[fieldName] = children
      .map((child: PlainObject) => redactDocumentForViewer(embeddedDefinition, child, viewer, ownershipLevel))
      .filter((child): child is PlainObject => child !== null);
  }
  return redacted;
}

/** Returns the copy of a document the viewer is allowed to receive, or null when it must stay hidden. */
export function redactDocumentForViewer(definition: DocumentTypeDefinition, source: PlainObject, viewer: Viewer, parentOwnershipLevel?: number): PlainObject | null {
  const viewLevel = viewLevelFor(definition, source, viewer, parentOwnershipLevel);
  if (viewLevel === VIEW_LEVELS.HIDDEN) return null;
  if (viewLevel === VIEW_LEVELS.LIMITED) return pickFields(source, definition.limitedFields);
  const ownershipLevel = effectiveOwnershipLevel(definition, source, viewer, parentOwnershipLevel);
  return redactSecretsForOwnership(definition, redactEmbeddedCollections(definition, source, viewer, ownershipLevel), ownershipLevel);
}

export function redactChangesForLimitedViewer(definition: DocumentTypeDefinition, changes: PlainObject): PlainObject {
  const limitedFields = new Set(definition.limitedFields);
  const redacted: PlainObject = {};
  for (const [key, value] of Object.entries(changes)) {
    if (limitedFields.has(key.split(".")[0])) redacted[key] = deepClone(value);
  }
  return redacted;
}
