import { formatDistance, type GridMeasure, measureMove, movedThisTurn, type Point, readTurnMovement } from "./turnMovementRules";
import { viewedCombat } from "./combatActions";

const FLAG_SCOPE = "world";
const FLAG_KEY = "turnMovement";
const GRIDLESS = 0;

/** Last stored position of each combatant token, so a move can be measured from where it started. */
const lastPositions = new Map<string, Point>();

function gridOf(scene: any): GridMeasure {
  const grid = scene?.grid ?? {};
  return { size: Number(grid.size) || 0, distance: Number(grid.distance) || 0, gridless: Number(grid.type) === GRIDLESS };
}

function storedMovement(combat: any) {
  return readTurnMovement(combat?._source?.flags?.[FLAG_SCOPE]?.[FLAG_KEY]);
}

/** What the combat tab shows: distance walked by the combatant acting now, or null when there is nothing to show. */
export function currentTurnMovementLabel(combat: any): string | null {
  const combatant = combat?.started ? combat.combatant : null;
  if (!combatant) return null;
  const distance = movedThisTurn(storedMovement(combat), combatant.id, combat.round);
  const scene = combatant.token?.parent ?? game.scenes?.get(combatant.sceneId);
  const grid = gridOf(scene);
  return formatDistance(distance, String(scene?.grid?.units ?? ""), grid.distance);
}

function rememberCombatantPositions(combat: any): void {
  for (const combatant of combat?.combatants ?? []) {
    const token = combatant.token;
    if (token) lastPositions.set(token.id, { x: Number(token.x), y: Number(token.y) });
  }
}

/** One GM client keeps the count, so two open GM windows never add the same step twice. */
function isTrackingClient(): boolean {
  return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

async function recordMove(tokenDocument: any): Promise<void> {
  const to = { x: Number(tokenDocument.x), y: Number(tokenDocument.y) };
  const from = lastPositions.get(tokenDocument.id);
  lastPositions.set(tokenDocument.id, to);
  const combat = viewedCombat();
  const combatant = combat?.started ? combat.combatant : null;
  if (!from || !combatant || combatant.tokenId !== tokenDocument.id || !isTrackingClient()) return;
  const step = measureMove(from, to, gridOf(tokenDocument.parent));
  if (step <= 0) return;
  const walked = movedThisTurn(storedMovement(combat), combatant.id, combat.round) + step;
  await combat.update({ [`flags.${FLAG_SCOPE}.${FLAG_KEY}`]: { combatantId: combatant.id, round: combat.round, distance: Math.round(walked * 100) / 100 } });
}

export function trackTurnMovement(): void {
  if (!game.user.isGM) return;
  Hooks.once("ready", () => rememberCombatantPositions(viewedCombat()));
  Hooks.on("createCombatant", (combatant: any) => rememberCombatantPositions(combatant.parent));
  Hooks.on("updateCombat", (combat: any) => rememberCombatantPositions(combat));
  Hooks.on("updateToken", (tokenDocument: any, changes: Record<string, unknown>) => {
    if (!("x" in changes) && !("y" in changes)) return;
    void recordMove(tokenDocument).catch(() => ui.notifications.warn("Não foi possível registrar o movimento do turno."));
  });
}
