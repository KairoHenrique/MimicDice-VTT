import type { ActorRole, SheetTemplate } from "@tabbletop/protocol";
import { CREATURE_SHEET_PAGES } from "./creatureSheetPages";

export const CREATURE_NPC_PRESET_ID = "preset-npc";
export const CREATURE_ENEMY_PRESET_ID = "preset-enemy";

function creaturePreset(id: string, name: string, role: ActorRole, description: string): SheetTemplate {
  return {
    id,
    name,
    role,
    description,
    layout: { version: 2, pages: structuredClone(CREATURE_SHEET_PAGES) as SheetTemplate["layout"]["pages"] },
  };
}

/** Default NPC sheet: the table's creature spreadsheet, same layout as the enemy model. */
export function creatureNpcPreset(): SheetTemplate {
  return creaturePreset(
    CREATURE_NPC_PRESET_ID,
    "Criatura (NPC)",
    "npc",
    "Ficha da planilha de criatura: tipo, atributos, PV, defesa, perícias, habilidades (melee/ranged/físico/mágico), loot e descrição.",
  );
}

/** Default enemy sheet: same creature board as the NPC model. */
export function creatureEnemyPreset(): SheetTemplate {
  return creaturePreset(
    CREATURE_ENEMY_PRESET_ID,
    "Criatura (inimigo)",
    "enemy",
    "Ficha da planilha de criatura: tipo, atributos, PV, defesa, perícias, habilidades (melee/ranged/físico/mágico), loot e descrição.",
  );
}
