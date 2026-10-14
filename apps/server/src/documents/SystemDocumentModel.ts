import { readFile } from "node:fs/promises";
import path from "node:path";
import { deepClone, getType, mergeObject, type PlainObject } from "@tabbletop/common";
import type { DocumentModelTemplates } from "@tabbletop/protocol";
import type { Logger } from "../logging/logger";
import type { InstalledPackage } from "../packages/PackageRegistry";

const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;

const SUBTYPED_DOCUMENTS = ["Actor", "Item", "ActiveEffect", "JournalEntryPage"] as const;

const CORE_SUBTYPES: Record<string, string[]> = {
  Actor: [],
  Item: [],
  ActiveEffect: ["base"],
  JournalEntryPage: ["text", "image", "pdf", "video"],
};

const FALLBACK_SUBTYPE = "base";

/** Subtypes, template.json defaults and HTML fields the active system declares for each document. */
export class SystemDocumentModel {
  private constructor(
    readonly templates: DocumentModelTemplates,
    private readonly subtypesByDocument: Map<string, Set<string>>,
    private readonly htmlFieldsBySubtype: Map<string, string[]>,
  ) {}

  static empty(): SystemDocumentModel {
    return SystemDocumentModel.#build({}, {});
  }

  static async load(system: InstalledPackage | undefined, logger: Logger): Promise<SystemDocumentModel> {
    if (!system) return SystemDocumentModel.empty();
    const declaredDocumentTypes = (system.manifestData.documentTypes ?? {}) as PlainObject;
    const templateJson = await readTemplateJson(system.directory, logger);
    return SystemDocumentModel.#build(templateJson, getType(declaredDocumentTypes) === "Object" ? declaredDocumentTypes : {});
  }

  static #build(templateJson: PlainObject, declaredDocumentTypes: PlainObject): SystemDocumentModel {
    const templates: DocumentModelTemplates = {};
    const subtypesByDocument = new Map<string, Set<string>>();
    const htmlFieldsBySubtype = new Map<string, string[]>();

    for (const documentName of SUBTYPED_DOCUMENTS) {
      const subtypes = new Set(CORE_SUBTYPES[documentName]);
      templates[documentName] = Object.fromEntries(CORE_SUBTYPES[documentName].map((subtype) => [subtype, {}]));
      for (const [subtype, data] of Object.entries(templateDataFor(templateJson[documentName]))) {
        subtypes.add(subtype);
        templates[documentName][subtype] = data;
      }
      for (const [subtype, declaration] of Object.entries((declaredDocumentTypes[documentName] ?? {}) as PlainObject)) {
        subtypes.add(subtype);
        templates[documentName][subtype] ??= {};
        const htmlFields = (declaration as PlainObject | null)?.htmlFields;
        if (Array.isArray(htmlFields)) htmlFieldsBySubtype.set(`${documentName}.${subtype}`, htmlFields.filter((field) => typeof field === "string"));
      }
      if (subtypes.size === 0) {
        subtypes.add(FALLBACK_SUBTYPE);
        templates[documentName][FALLBACK_SUBTYPE] = {};
      }
      subtypesByDocument.set(documentName, subtypes);
    }
    return new SystemDocumentModel(templates, subtypesByDocument, htmlFieldsBySubtype);
  }

  isAllowedSubtype(documentName: string, subtype: string): boolean {
    return this.subtypesByDocument.get(documentName)?.has(subtype) ?? false;
  }

  defaultSubtype(documentName: string): string {
    const subtypes = this.subtypesByDocument.get(documentName);
    return subtypes?.values().next().value ?? FALLBACK_SUBTYPE;
  }

  defaultSystemData(documentName: string, subtype: string): PlainObject {
    return deepClone(this.templates[documentName]?.[subtype] ?? {});
  }

  systemHtmlFields(documentName: string, subtype: string): string[] {
    return this.htmlFieldsBySubtype.get(`${documentName}.${subtype}`) ?? [];
  }
}

async function readTemplateJson(directory: string, logger: Logger): Promise<PlainObject> {
  try {
    const raw = await readFile(path.join(directory, "template.json"), "utf8");
    if (raw.length > MAX_TEMPLATE_BYTES) throw new Error("template.json grande demais");
    const parsed = JSON.parse(raw);
    return getType(parsed) === "Object" ? parsed : {};
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      logger.warn("template.json do sistema ignorado", { reason: error instanceof Error ? error.message.slice(0, 200) : "desconhecido" });
    }
    return {};
  }
}

/** Resolves legacy template.json entries: `types` lists subtypes and each may pull shared `templates`. */
function templateDataFor(documentTemplate: unknown): Record<string, PlainObject> {
  if (getType(documentTemplate) !== "Object") return {};
  const { types, templates: sharedTemplates = {}, ...subtypeEntries } = documentTemplate as PlainObject;
  if (!Array.isArray(types)) return {};
  const resolved: Record<string, PlainObject> = {};
  for (const subtype of types) {
    if (typeof subtype !== "string") continue;
    const { templates: templateNames = [], ...ownData } = (subtypeEntries[subtype] ?? {}) as PlainObject;
    const data: PlainObject = {};
    for (const templateName of Array.isArray(templateNames) ? templateNames : []) {
      mergeObject(data, deepClone((sharedTemplates as PlainObject)[templateName] ?? {}));
    }
    resolved[subtype] = mergeObject(data, deepClone(ownData));
  }
  return resolved;
}
