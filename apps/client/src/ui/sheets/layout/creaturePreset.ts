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

/** Default NPC sheet: same board as the enemy model. */
export function creatureNpcPreset(): SheetTemplate {
  return creaturePreset(
    CREATURE_NPC_PRESET_ID,
    "NPC",
    "npc",
    "Ficha padrão de NPC: tipo, atributos (0 = 2d20 menor, 1+ = Nd20 maior), PV, defesa, perícias, habilidades, loot e descrição.",
  );
}

/** Default enemy sheet: same creature board as the NPC model. */
export function creatureEnemyPreset(): SheetTemplate {
  return creaturePreset(
    CREATURE_ENEMY_PRESET_ID,
    "Inimigo",
    "enemy",
    "Ficha padrão de inimigo: tipo, atributos (0 = 2d20 menor, 1+ = Nd20 maior), PV, defesa, perícias, habilidades, loot e descrição.",
  );
}
