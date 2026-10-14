import { effectsRollBonus, type SheetRollMode } from "@tabbletop/protocol";
import { sheetRollModeFor } from "./npcRollPrivacy";
import { applyRollMode } from "./rollModes";
import { rollAsSpeaker } from "../dice/rollCommands";
import { actorEffects } from "../effects/effectStore";

function actorOf(document: any): any {
  return document.documentName === "Actor" ? document : (document.actor ?? null);
}

/** Bonus and penalty effects on the character ride along with every sheet roll, named in the flavor. */
function withEffectBonuses(actor: any, formula: string, label: string): { formula: string; label: string } {
  const effects = actorEffects(actor).filter((effect) => effect.rollBonus);
  const bonus = effectsRollBonus(effects);
  if (!bonus) return { formula, label };
  const names = effects.map((effect) => `${effect.name} ${effect.rollBonus.startsWith("-") ? "" : "+"}${effect.rollBonus}`).join(", ");
  return { formula: `${formula}${bonus}`, label: `${label} (${names})` };
}

export function rollFromSheet(document: any, rawFormula: string, label: string, extraRollData: Record<string, unknown> = {}, mode?: SheetRollMode): void {
  const actor = actorOf(document);
  const rolled = withEffectBonuses(actor, applyRollMode(rawFormula, mode), label);
  if (!Roll.validate(rolled.formula)) {
    ui.notifications.warn(`A fórmula "${rolled.formula}" não é uma rolagem válida.`);
    return;
  }
  void rollAsSpeaker(rolled.formula, { actor, flavor: rolled.label, extraRollData, rollMode: sheetRollModeFor(actor) }).catch((error: Error) => ui.notifications.error(error.message));
}
