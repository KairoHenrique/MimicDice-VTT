import { embeddedDocumentType, parseDocumentUuid, worldDocumentType, type DocumentTypeDefinition, type PlainObject } from "@tabbletop/common";
import type { DocumentSource } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";

export interface DocumentNode {
  definition: DocumentTypeDefinition;
  source: DocumentSource;
}

export interface ResolvedParentChain {
  /** World document first, then each embedded ancestor down to the direct parent. */
  ancestors: DocumentNode[];
  rootCollection: string;
}

export interface ResolvedEmbeddedTarget {
  definition: DocumentTypeDefinition;
  fieldName: string;
}

export type WorldDocumentLookup = (collectionName: string, documentId: string) => DocumentSource | undefined;

/** Walks a parent UUID inside an already-loaded root document. `rootOverride` lets callers walk a working copy. */
export function resolveParentChain(parentUuid: string, lookup: WorldDocumentLookup, rootOverride?: DocumentSource): ResolvedParentChain {
  const segments = parseDocumentUuid(parentUuid);
  if (!segments) throw HttpError.badRequest("UUID do documento pai inválido");
  const [rootSegment, ...embeddedSegments] = segments;
  const rootDefinition = worldDocumentType(rootSegment.documentName);
  if (!rootDefinition) throw HttpError.badRequest("Tipo de documento pai inválido");
  const root = rootOverride ?? lookup(rootDefinition.collection, rootSegment.documentId);
  if (!root) throw HttpError.notFound("Documento pai não encontrado");

  const ancestors: DocumentNode[] = [{ definition: rootDefinition, source: root }];
  for (const segment of embeddedSegments) {
    const parent = ancestors[ancestors.length - 1];
    const fieldName = parent.definition.embedded[segment.documentName];
    const definition = embeddedDocumentType(segment.documentName);
    if (!fieldName || !definition) throw HttpError.badRequest("Hierarquia de documentos inválida");
    const child = embeddedCollection(parent.source, fieldName).find((candidate) => candidate._id === segment.documentId);
    if (!child) throw HttpError.notFound("Documento pai não encontrado");
    ancestors.push({ definition, source: child });
  }
  return { ancestors, rootCollection: rootDefinition.collection };
}

export function resolveEmbeddedTarget(parent: DocumentNode, embeddedName: string): ResolvedEmbeddedTarget {
  const fieldName = parent.definition.embedded[embeddedName];
  const definition = embeddedDocumentType(embeddedName);
  if (!fieldName || !definition) throw HttpError.badRequest(`${parent.definition.name} não aceita ${embeddedName}`);
  return { definition, fieldName };
}

export function embeddedCollection(source: PlainObject, fieldName: string): DocumentSource[] {
  if (!Array.isArray(source[fieldName])) source[fieldName] = [];
  return source[fieldName] as DocumentSource[];
}
