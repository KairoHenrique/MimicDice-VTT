import { ApplicationV2 } from "../../applications/ApplicationV2";
import { currentConfig } from "../../runtime";

interface SheetRegistrationOptions {
  label?: string | (() => string);
  types?: string[];
  makeDefault?: boolean;
  canBeDefault?: boolean;
  canConfigure?: boolean;
}

interface SheetRegistration {
  id: string;
  cls: any;
  default: boolean;
  label: string;
  canBeDefault: boolean;
  canConfigure: boolean;
}

interface SheetableDocumentClass {
  documentName: string;
  TYPES: string[];
  metadata: { hasTypeData: boolean };
}

function sheetClassesFor(documentName: string): Record<string, Record<string, SheetRegistration>> {
  const config = currentConfig();
  config[documentName] ??= {};
  config[documentName].sheetClasses ??= {};
  return config[documentName].sheetClasses;
}

function typesFor(documentClass: SheetableDocumentClass, types: string[] | undefined): string[] {
  if (types?.length) return types;
  return documentClass.metadata.hasTypeData ? documentClass.TYPES : ["base"];
}

export const DocumentSheetConfig = Object.freeze({
  registerSheet(documentClass: SheetableDocumentClass, scope: string, sheetClass: any, options: SheetRegistrationOptions = {}): void {
    const { label, types, makeDefault = false, canBeDefault = true, canConfigure = true } = options;
    const sheetId = `${scope}.${sheetClass.name}`;
    const resolvedLabel = typeof label === "function" ? label() : (label ?? sheetClass.name);
    const sheetClasses = sheetClassesFor(documentClass.documentName);
    for (const type of typesFor(documentClass, types)) {
      sheetClasses[type] ??= {};
      if (makeDefault) for (const registration of Object.values(sheetClasses[type])) registration.default = false;
      sheetClasses[type][sheetId] = { id: sheetId, cls: sheetClass, default: makeDefault, label: resolvedLabel, canBeDefault, canConfigure };
    }
  },

  unregisterSheet(documentClass: SheetableDocumentClass, scope: string, sheetClass: any, { types }: { types?: string[] } = {}): void {
    const sheetId = `${scope}.${typeof sheetClass === "string" ? sheetClass : sheetClass?.name}`;
    const sheetClasses = sheetClassesFor(documentClass.documentName);
    for (const type of types?.length ? types : Object.keys(sheetClasses)) delete sheetClasses[type]?.[sheetId];
  },

  getSheetClass(document: { documentName: string; type?: string; _source: { flags?: Record<string, any> } }): any {
    const registrations = sheetClassesFor(document.documentName)[document.type ?? "base"] ?? sheetClassesFor(document.documentName).base ?? {};
    const configuredId = document._source.flags?.core?.sheetClass;
    const candidates = Object.values(registrations);
    const chosen = (configuredId && registrations[configuredId]) || candidates.find((registration) => registration.default) || candidates.at(-1);
    return chosen?.cls ?? null;
  },

  isApplicationV2(sheetClass: any): boolean {
    return sheetClass === ApplicationV2 || sheetClass?.prototype instanceof ApplicationV2;
  },
});
