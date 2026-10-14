import { redactDocumentForViewer, worldDocumentTypeForCollection, type Viewer } from "@tabbletop/common";
import type { DocumentSource } from "@tabbletop/protocol";
import type { DocumentService } from "./DocumentService";

/** Joining clients receive only the most recent messages; older ones stay on disk. */
export const MESSAGE_HISTORY_LIMIT = 200;

function mostRecentMessages(messages: DocumentSource[]): DocumentSource[] {
  if (messages.length <= MESSAGE_HISTORY_LIMIT) return messages.sort(byTimestamp);
  return messages.sort(byTimestamp).slice(-MESSAGE_HISTORY_LIMIT);
}

function byTimestamp(left: DocumentSource, right: DocumentSource): number {
  return Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0);
}

/** Every world document the viewer may receive, already redacted, keyed by collection name. */
export function visibleWorldDocuments(documents: DocumentService, viewer: Viewer): Record<string, DocumentSource[]> {
  const visible: Record<string, DocumentSource[]> = {};
  for (const collectionName of documents.collectionNames()) {
    const definition = worldDocumentTypeForCollection(collectionName);
    if (!definition) continue;
    const viewerCopies = documents
      .listCollection(collectionName)
      .map((source) => redactDocumentForViewer(definition, source, viewer))
      .filter((source): source is DocumentSource => source !== null);
    visible[collectionName] = definition.name === "ChatMessage" ? mostRecentMessages(viewerCopies) : viewerCopies;
  }
  return visible;
}
