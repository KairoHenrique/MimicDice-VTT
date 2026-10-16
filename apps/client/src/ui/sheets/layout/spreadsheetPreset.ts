import type { SheetTemplate } from "@tabbletop/protocol";
import { PLAYER_SHEET_PAGES } from "./playerSheetPages";

export const SPREADSHEET_PRESET_ID = "preset-planilha";

export function spreadsheetPreset(): SheetTemplate {
  return {
    id: SPREADSHEET_PRESET_ID,
    name: "Player",
    role: "player",
    description: "Ficha padrão de jogador: classes, atributos (0 = 2d20 menor, 1+ = Nd20 maior), perícias, PV/PE, armaduras, arma e inventário.",
    layout: { version: 2, pages: structuredClone(PLAYER_SHEET_PAGES) as SheetTemplate["layout"]["pages"] },
  };
}
