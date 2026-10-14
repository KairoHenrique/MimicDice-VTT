import { ACTOR_ROLES, MAX_SAVED_SHEET_TEMPLATES, savedSheetTemplatesSchema, type ActorRole, type SheetLayout, type SheetTemplate } from "@tabbletop/protocol";
import { cloneLayoutWithNewIds, EMPTY_LAYOUT, newLocalId, readLayout } from "./sheetLayoutRules";
import { BUILT_IN_DEFAULT_TEMPLATE_IDS, SHEET_PRESETS } from "./sheetPresets";

export const MIMICDICE_SETTINGS_NAMESPACE = "mimicdice";
export const SHEET_TEMPLATES_SETTING = "sheetTemplates";
export const DEFAULT_TEMPLATES_SETTING = "defaultTemplates";

function readSavedTemplates(): SheetTemplate[] {
  const parsed = savedSheetTemplatesSchema.safeParse(game.settings.get(MIMICDICE_SETTINGS_NAMESPACE, SHEET_TEMPLATES_SETTING));
  if (!parsed.success) return [];
  return parsed.data.templates.map((template) => ({ ...template, layout: readLayout(template.layout) ?? EMPTY_LAYOUT }));
}

/** Built-in presets plus the sheet models the GM saved for this world. */
export function listSheetTemplates(): SheetTemplate[] {
  return [...SHEET_PRESETS, ...readSavedTemplates()];
}

export function savedSheetTemplates(): SheetTemplate[] {
  return readSavedTemplates();
}

export function findSheetTemplate(templateId: string): SheetTemplate | undefined {
  return listSheetTemplates().find((template) => template.id === templateId);
}

/** Saving with an existing name replaces that model, so "salvar de novo" updates it in place. */
export async function saveSheetTemplate(name: string, role: ActorRole, layout: SheetLayout, description?: string): Promise<SheetTemplate> {
  const saved = readSavedTemplates();
  const existingIndex = saved.findIndex((template) => template.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
  if (existingIndex < 0 && saved.length >= MAX_SAVED_SHEET_TEMPLATES) throw new Error(`Limite de ${MAX_SAVED_SHEET_TEMPLATES} modelos salvos.`);
  const template: SheetTemplate = { id: saved[existingIndex]?.id ?? newLocalId(), name, role, description, layout: cloneLayoutWithNewIds(layout) };
  const next = existingIndex < 0 ? [...saved, template] : saved.map((entry, index) => (index === existingIndex ? template : entry));
  await game.settings.set(MIMICDICE_SETTINGS_NAMESPACE, SHEET_TEMPLATES_SETTING, savedSheetTemplatesSchema.parse({ templates: next }));
  return template;
}

function readDefaultTemplateIds(): Partial<Record<ActorRole, string>> {
  const stored = game.settings.get(MIMICDICE_SETTINGS_NAMESPACE, DEFAULT_TEMPLATES_SETTING) as unknown;
  if (typeof stored !== "object" || stored === null) return {};
  return Object.fromEntries(Object.entries(stored).filter(([role, id]) => (ACTOR_ROLES as readonly string[]).includes(role) && typeof id === "string")) as Partial<Record<ActorRole, string>>;
}

/** The sheet every new actor of this role starts with: the GM's choice, else the built-in preset. */
export function defaultTemplateFor(role: ActorRole): SheetTemplate | undefined {
  return findSheetTemplate(readDefaultTemplateIds()[role] ?? "") ?? findSheetTemplate(BUILT_IN_DEFAULT_TEMPLATE_IDS[role]);
}

export async function setDefaultTemplate(role: ActorRole, templateId: string): Promise<void> {
  await game.settings.set(MIMICDICE_SETTINGS_NAMESPACE, DEFAULT_TEMPLATES_SETTING, { ...readDefaultTemplateIds(), [role]: templateId });
}

export async function deleteSheetTemplate(templateId: string): Promise<void> {
  const next = readSavedTemplates().filter((template) => template.id !== templateId);
  await game.settings.set(MIMICDICE_SETTINGS_NAMESPACE, SHEET_TEMPLATES_SETTING, { templates: next });
}
