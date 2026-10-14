import { CORE_RELEASE, MAX_DOCUMENT_BYTES, type DocumentSource } from "@tabbletop/protocol";
import {
  DOCUMENT_OWNERSHIP_LEVELS,
  deepClone,
  embeddedDocumentType,
  expandObject,
  isDocumentId,
  mergeObject,
  type DocumentTypeDefinition,
  type PlainObject,
} from "@tabbletop/common";
import type { z } from "zod";
import { HttpError } from "../errors/HttpError";
import { generateDocumentId } from "../world/documentIds";
import { DOCUMENT_SCHEMAS } from "./documentSchemas";
import { sanitizeHtmlFields } from "./htmlSanitizer";
import type { SystemDocumentModel } from "./SystemDocumentModel";

export interface SourceAuthor {
  userId: string;
  isGameMaster: boolean;
}

export interface CreateSourceOptions {
  keepId: boolean;
  isTakenId: (documentId: string) => boolean;
}

export interface PreparedUpdate {
  source: DocumentSource;
  changes: PlainObject;
}

function schemaFor(definition: DocumentTypeDefinition): z.ZodType<Record<string, unknown>> {
  const schema = DOCUMENT_SCHEMAS[definition.name];
  if (!schema) throw HttpError.badRequest(`Tipo de documento não suportado: ${definition.name}`);
  return schema;
}

function parseWithSchema(definition: DocumentTypeDefinition, candidate: PlainObject): PlainObject {
  const result = schemaFor(definition).safeParse(candidate);
  if (result.success) return result.data;
  const firstIssue = result.error.issues[0];
  const fieldPath = firstIssue?.path.join(".") || "documento";
  throw HttpError.badRequest(`${definition.name} inválido: campo "${fieldPath}"`);
}

function assertWithinSizeLimit(definition: DocumentTypeDefinition, source: PlainObject): void {
  if (Buffer.byteLength(JSON.stringify(source), "utf8") > MAX_DOCUMENT_BYTES) {
    throw HttpError.badRequest(`${definition.name} grande demais`);
  }
}

function stampStats(source: PlainObject, author: SourceAuthor, systemId: string | null, created: boolean): void {
  const now = Date.now();
  const previous = (source._stats ?? {}) as PlainObject;
  source._stats = {
    coreVersion: CORE_RELEASE.version,
    systemId,
    systemVersion: null,
    createdTime: created ? now : (previous.createdTime ?? now),
    modifiedTime: now,
    lastModifiedBy: author.userId,
    compendiumSource: previous.compendiumSource ?? null,
    duplicateSource: previous.duplicateSource ?? null,
  };
}

export class DocumentSourceValidator {
  constructor(
    private readonly systemModel: SystemDocumentModel,
    private readonly systemId: string | null,
  ) {}

  prepareCreate(definition: DocumentTypeDefinition, rawData: PlainObject, author: SourceAuthor, options: CreateSourceOptions): DocumentSource {
    const parsed = parseWithSchema(definition, expandObject(rawData));
    const requestedId = parsed._id;
    parsed._id = options.keepId && isDocumentId(requestedId) && !options.isTakenId(requestedId) ? requestedId : generateDocumentId();
    this.#finalizeNewSource(definition, parsed, author);
    if (definition.hasOwnership && !embeddedDocumentType(definition.name)) this.#assignCreatorOwnership(parsed, author);
    if (definition.accessModel === "authored") this.#stampAuthorship(parsed, author);
    assertWithinSizeLimit(definition, parsed);
    return parsed as DocumentSource;
  }

  prepareUpdate(definition: DocumentTypeDefinition, existing: DocumentSource, rawChanges: PlainObject, author: SourceAuthor): PreparedUpdate {
    const changes = expandObject(rawChanges);
    for (const protectedKey of ["_id", "_stats", ...Object.values(definition.embedded)]) delete changes[protectedKey];
    if (!author.isGameMaster) {
      const gmOnlyKeys = definition.accessModel === "authored" ? ["author", "timestamp"] : [];
      for (const protectedKey of [...gmOnlyKeys, ...(definition.gmOnlyFields ?? [])]) {
        delete changes[protectedKey];
        delete changes[`-=${protectedKey}`];
      }
    }
    if (typeof changes.type === "string" && changes.type !== existing.type) this.#assertSubtype(definition, changes.type);
    sanitizeHtmlFields(changes, this.#htmlFieldsFor(definition, String(changes.type ?? existing.type ?? "")));

    const merged = mergeObject(deepClone(existing), deepClone(changes), { performDeletions: true });
    const parsed = parseWithSchema(definition, merged);
    parsed._id = existing._id;
    stampStats(parsed, author, this.systemId, false);
    assertWithinSizeLimit(definition, parsed);
    return { source: parsed as DocumentSource, changes: this.#retainSchemaKeys(changes, parsed) };
  }

  #finalizeNewSource(definition: DocumentTypeDefinition, source: PlainObject, author: SourceAuthor): void {
    if (definition.hasTypeData) {
      const subtype = typeof source.type === "string" && source.type ? source.type : this.systemModel.defaultSubtype(definition.name);
      this.#assertSubtype(definition, subtype);
      source.type = subtype;
      source.system = mergeObject(this.systemModel.defaultSystemData(definition.name, subtype), (source.system ?? {}) as PlainObject);
    }
    sanitizeHtmlFields(source, this.#htmlFieldsFor(definition, String(source.type ?? "")));
    if (definition.hasOwnership && embeddedDocumentType(definition.name) && !author.isGameMaster) {
      source.ownership = { default: DOCUMENT_OWNERSHIP_LEVELS.INHERIT };
    }
    stampStats(source, author, this.systemId, true);
    this.#finalizeEmbeddedChildren(definition, source, author);
  }

  #finalizeEmbeddedChildren(definition: DocumentTypeDefinition, source: PlainObject, author: SourceAuthor): void {
    for (const [embeddedName, fieldName] of Object.entries(definition.embedded)) {
      const childDefinition = embeddedDocumentType(embeddedName);
      const children = source[fieldName];
      if (!childDefinition || !Array.isArray(children)) continue;
      const usedIds = new Set<string>();
      for (const child of children as PlainObject[]) {
        if (!isDocumentId(child._id) || usedIds.has(child._id)) child._id = generateDocumentId();
        usedIds.add(child._id as string);
        this.#finalizeNewSource(childDefinition, child, author);
      }
    }
  }

  #assignCreatorOwnership(source: PlainObject, author: SourceAuthor): void {
    if (!author.isGameMaster) {
      source.ownership = { default: DOCUMENT_OWNERSHIP_LEVELS.NONE, [author.userId]: DOCUMENT_OWNERSHIP_LEVELS.OWNER };
      return;
    }
    const ownership = (source.ownership ?? {}) as Record<string, number>;
    ownership.default ??= DOCUMENT_OWNERSHIP_LEVELS.NONE;
    ownership[author.userId] ??= DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    source.ownership = ownership;
  }

  /** Players always author as themselves; only a GM may post on behalf of another user. */
  #stampAuthorship(source: PlainObject, author: SourceAuthor): void {
    if (!author.isGameMaster || !isDocumentId(source.author)) source.author = author.userId;
    if ("timestamp" in source) source.timestamp = Date.now();
  }

  #assertSubtype(definition: DocumentTypeDefinition, subtype: string): void {
    if (!this.systemModel.isAllowedSubtype(definition.name, subtype)) {
      throw HttpError.badRequest(`Tipo "${subtype.slice(0, 64)}" não existe para ${definition.name}`);
    }
  }

  #htmlFieldsFor(definition: DocumentTypeDefinition, subtype: string): string[] {
    const systemFields = definition.hasTypeData ? this.systemModel.systemHtmlFields(definition.name, subtype).map((field) => `system.${field}`) : [];
    return [...definition.htmlFields, ...systemFields];
  }

  /** Drops top-level keys the schema rejected, so other clients never receive data the server did not store. */
  #retainSchemaKeys(changes: PlainObject, parsed: PlainObject): PlainObject {
    const retained: PlainObject = {};
    for (const [key, value] of Object.entries(changes)) {
      const baseKey = key.startsWith("-=") ? key.slice(2) : key;
      if (baseKey in parsed || key.startsWith("-=")) retained[key] = value;
    }
    retained._id = parsed._id;
    return retained;
  }
}
