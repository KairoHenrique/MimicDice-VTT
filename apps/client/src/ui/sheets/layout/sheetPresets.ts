import type { ActorRole, SheetTemplate } from "@tabbletop/protocol";
import { SPREADSHEET_PRESET_ID, spreadsheetPreset } from "./spreadsheetPreset";

/** The table's own sheet is the only built-in model; GMs save their variations as world models. */
export const SHEET_PRESETS: readonly SheetTemplate[] = Object.freeze([spreadsheetPreset()]);

/** Built-in fallback when the GM has not chosen a default model for the role (or the chosen one no longer exists). */
export const BUILT_IN_DEFAULT_TEMPLATE_IDS: Readonly<Record<ActorRole, string>> = Object.freeze({ player: SPREADSHEET_PRESET_ID, npc: SPREADSHEET_PRESET_ID, enemy: SPREADSHEET_PRESET_ID });

export function isPresetId(templateId: string): boolean {
  return templateId.startsWith("preset-");
}
