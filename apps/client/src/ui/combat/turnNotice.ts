import { panToCombatant } from "./combatActions";

const TURN_FIELDS = ["currentCombatantId", "turn", "round", "started"];

/** Tells a player when the turn reaches one of their combatants and shows them the token. */
export function announceOwnTurns(): void {
  Hooks.on("updateCombat", (combat: any, change: Record<string, unknown>) => {
    if (game.user.isGM || !combat.started) return;
    if (!TURN_FIELDS.some((field) => Object.hasOwn(change, field))) return;
    const combatant = combat.combatant;
    if (!combatant?.isOwner || combatant.defeated) return;
    ui.notifications.info(`É o seu turno, ${combatant.name}!`);
    panToCombatant(combatant);
  });
}
