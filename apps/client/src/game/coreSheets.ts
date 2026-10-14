import { ActiveEffectConfig, DocumentSheetConfig } from "@tabbletop/api";
import { SceneConfigSheet } from "../ui/canvas/SceneConfigSheet";
import { GenericActorSheet, GenericItemSheet, GenericJournalSheet } from "../ui/sheets/GenericDocumentSheet";
import { MimicDiceActorSheet } from "../ui/sheets/MimicDiceActorSheet";

export const MIMICDICE_ACTOR_SHEET_ID = `core.${MimicDiceActorSheet.name}`;

/** Registered before packages load, so a system's own sheets (registered with makeDefault) take precedence. */
export function registerCoreSheets(): void {
  const options = { makeDefault: true, label: "Ficha livre (MimicDice VTT)" };
  DocumentSheetConfig.registerSheet(CONFIG.Actor.documentClass, "core", GenericActorSheet, { label: "Ficha simples (campos soltos)" });
  DocumentSheetConfig.registerSheet(CONFIG.Actor.documentClass, "core", MimicDiceActorSheet, { makeDefault: true, label: "Ficha MimicDice" });
  DocumentSheetConfig.registerSheet(CONFIG.Item.documentClass, "core", GenericItemSheet, options);
  DocumentSheetConfig.registerSheet(CONFIG.JournalEntry.documentClass, "core", GenericJournalSheet, options);
  DocumentSheetConfig.registerSheet(CONFIG.Scene.documentClass, "core", SceneConfigSheet, { makeDefault: true, label: "Configuração de cena" });
  DocumentSheetConfig.registerSheet(CONFIG.ActiveEffect.documentClass, "core", ActiveEffectConfig, { makeDefault: true, label: "Efeito ativo" });
}
