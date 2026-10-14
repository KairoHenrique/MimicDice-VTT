import type { SheetTemplate } from "@tabbletop/protocol";
import { PLAYER_SHEET_PAGES } from "./playerSheetPages";

export const SPREADSHEET_PRESET_ID = "preset-planilha";

export function spreadsheetPreset(): SheetTemplate {
  return {
    id: SPREADSHEET_PRESET_ID,
    name: "Agente (jogador)",
    role: "player",
    description: "A ficha da mesa: classes, atributos, perícias, PV e PE pela classe e nível, sanidade, armaduras, arma equipada, bônus e inventário.",
    layout: { version: 2, pages: structuredClone(PLAYER_SHEET_PAGES) as SheetTemplate["layout"]["pages"] },
  };
}
