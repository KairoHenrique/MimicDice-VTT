import type { SheetRollMode } from "@tabbletop/protocol";
import { sheetRollModeFor } from "./npcRollPrivacy";
import { applyRollMode } from "./rollModes";
import { rollAsSpeaker } from "../dice/rollCommands";

function actorOf(document: any): any {
  return document.documentName === "Actor" ? document : (document.actor ?? null);
}

export function rollFromSheet(document: any, rawFormula: string, label: string, extraRollData: Record<string, unknown> = {}, mode?: SheetRollMode): void {
  const formula = applyRollMode(rawFormula, mode);
  if (!Roll.validate(formula)) {
    ui.notifications.warn(`A fórmula "${formula}" não é uma rolagem válida.`);
    return;
  }
  const actor = actorOf(document);
  void rollAsSpeaker(formula, { actor, flavor: label, extraRollData, rollMode: sheetRollModeFor(actor) }).catch((error: Error) => ui.notifications.error(error.message));
}
