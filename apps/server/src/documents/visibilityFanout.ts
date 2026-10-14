import {
  deepClone,
  effectiveOwnershipLevel,
  redactChangesForLimitedViewer,
  redactDocumentForViewer,
  redactSecretsForOwnership,
  viewLevelFor,
  VIEW_LEVELS,
  type DocumentTypeDefinition,
  type PlainObject,
  type Viewer,
  type ViewLevel,
} from "@tabbletop/common";
import type { DocumentSource, ModifyDocumentResponse } from "@tabbletop/protocol";
import type { DocumentNode } from "./documentTree";
import type { ModificationOutcome } from "./DocumentService";

interface ViewerPerspective {
  viewLevel: ViewLevel;
  parentOwnershipLevel: number | undefined;
}

interface ViewerMessages {
  deletes: string[];
  creates: PlainObject[];
  updates: PlainObject[];
}

/** Resolves how a viewer sees a document, walking its ancestors (all of which must be fully visible). */
function perspectiveOf(definition: DocumentTypeDefinition, source: DocumentSource | null, ancestors: readonly DocumentNode[], viewer: Viewer): ViewerPerspective {
  const hidden: ViewerPerspective = { viewLevel: VIEW_LEVELS.HIDDEN, parentOwnershipLevel: undefined };
  if (!source) return hidden;
  let parentOwnershipLevel: number | undefined;
  for (const ancestor of ancestors) {
    if (viewLevelFor(ancestor.definition, ancestor.source, viewer, parentOwnershipLevel) !== VIEW_LEVELS.FULL) return hidden;
    parentOwnershipLevel = effectiveOwnershipLevel(ancestor.definition, ancestor.source, viewer, parentOwnershipLevel);
  }
  return { viewLevel: viewLevelFor(definition, source, viewer, parentOwnershipLevel), parentOwnershipLevel };
}

function collectViewerMessages(outcome: ModificationOutcome, viewer: Viewer): ViewerMessages {
  const messages: ViewerMessages = { deletes: [], creates: [], updates: [] };
  const { definition, ancestors } = outcome;
  for (const { before, after, changes } of outcome.affected) {
    const previous = perspectiveOf(definition, before, ancestors, viewer).viewLevel;
    const current = perspectiveOf(definition, after, ancestors, viewer);
    const documentId = (after ?? before)?._id as string;

    if (previous === VIEW_LEVELS.HIDDEN && current.viewLevel === VIEW_LEVELS.HIDDEN) continue;
    if (current.viewLevel === VIEW_LEVELS.HIDDEN) {
      messages.deletes.push(documentId);
      continue;
    }
    if (previous !== current.viewLevel) {
      if (previous !== VIEW_LEVELS.HIDDEN) messages.deletes.push(documentId);
      const visibleCopy = redactDocumentForViewer(definition, after as DocumentSource, viewer, current.parentOwnershipLevel);
      if (visibleCopy) messages.creates.push(visibleCopy);
      continue;
    }
    if (!changes) continue;
    const visibleChanges = visibleChangesFor(definition, after as DocumentSource, changes, viewer, current);
    if (Object.keys(visibleChanges).some((key) => key !== "_id")) messages.updates.push({ ...visibleChanges, _id: documentId });
  }
  return messages;
}

/** Limited viewers get only public fields; non-owners get HTML fields without secret sections. */
function visibleChangesFor(definition: DocumentTypeDefinition, after: DocumentSource, changes: PlainObject, viewer: Viewer, perspective: ViewerPerspective): PlainObject {
  if (perspective.viewLevel === VIEW_LEVELS.LIMITED) return redactChangesForLimitedViewer(definition, changes);
  if (definition.htmlFields.length === 0) return changes;
  const ownershipLevel = effectiveOwnershipLevel(definition, after, viewer, perspective.parentOwnershipLevel);
  return redactSecretsForOwnership(definition, deepClone(changes), ownershipLevel);
}

/** The requester's acknowledgement obeys the same visibility rules as the broadcast (e.g. blind rolls hide results from their author). */
export function redactResponseForRequester(outcome: ModificationOutcome, requester: Viewer): ModifyDocumentResponse {
  const { definition, ancestors, response } = outcome;
  if (response.action === "delete") return response;
  const result: PlainObject[] = [];
  for (const { after, changes } of outcome.affected) {
    const perspective = perspectiveOf(definition, after, ancestors, requester);
    if (perspective.viewLevel === VIEW_LEVELS.HIDDEN) continue;
    if (response.action === "create") {
      const visibleCopy = redactDocumentForViewer(definition, after as DocumentSource, requester, perspective.parentOwnershipLevel);
      if (visibleCopy) result.push(visibleCopy);
      continue;
    }
    const visibleChanges = visibleChangesFor(definition, after as DocumentSource, changes ?? {}, requester, perspective);
    result.push({ ...visibleChanges, _id: (after as DocumentSource)._id });
  }
  return { ...response, result };
}

/** Builds the per-viewer broadcast for a modification; transitions in visibility become create/delete events. */
export function buildViewerResponses(outcome: ModificationOutcome, viewer: Viewer): ModifyDocumentResponse[] {
  const { deletes, creates, updates } = collectViewerMessages(outcome, viewer);
  const base = { type: outcome.response.type, userId: outcome.response.userId, operation: outcome.response.operation };
  const responses: ModifyDocumentResponse[] = [];
  if (deletes.length > 0) responses.push({ ...base, action: "delete", result: deletes });
  if (creates.length > 0) responses.push({ ...base, action: "create", result: creates });
  if (updates.length > 0) responses.push({ ...base, action: "update", result: updates });
  return responses;
}
