import { CONST, escapeHTML } from "@tabbletop/api";
import { afterOwnTurn, type AppliedEffect, dealsTurnDamage, hasActsLast, strongestVisionLimit, turnStartDamage } from "@tabbletop/protocol";
import { statusResources } from "../../game/tableRules";
import { readActorResources } from "../status/statusReadings";
import { resourceUpdate, steppedValue } from "../status/statusValueEditing";
import { actorEffects, saveActorEffects } from "./effectStore";
import { tokenBadge } from "./effectVisuals";

const EFFECTS_CHANGE_PATH = ["flags", "world", "effects"] as const;

interface TurnPosition {
  round: number;
  turn: number;
  combatantId: string | null;
}

function changedEffects(change: Record<string, any>): boolean {
  let node: any = change;
  for (const key of EFFECTS_CHANGE_PATH) {
    if (!node || typeof node !== "object") return false;
    if (key === "effects" && ("-=effects" in node || "effects" in node)) return true;
    node = node[key];
  }
  return false;
}

function refreshActorOnBoard(actor: any): void {
  for (const token of canvas?.tokens?.placeables ?? []) if (token.document?.actorId === actor.id) token.refresh?.();
  canvas?.perception?.update?.();
  void ui.combat?.render();
}

/** Combat order, vision and token badges follow the effects on each character. */
export function installEffectRules(): void {
  const combatClass = CONFIG.Combat?.documentClass;
  if (combatClass) combatClass.actsLastRule = (combatant: any) => hasActsLast(actorEffects(combatant.actor));
  const tokenClass = CONFIG.Token?.objectClass;
  if (tokenClass) {
    tokenClass.visionLimitRule = (token: any) => strongestVisionLimit(actorEffects(token.actor));
    tokenClass.badgesRule = (token: any) => actorEffects(token.actor).map(tokenBadge);
  }
  Hooks.on("updateActor", (actor: any, change: Record<string, any>) => {
    if (changedEffects(change)) refreshActorOnBoard(actor);
  });
  watchTurnsForEffects();
}

function isActiveGameMaster(): boolean {
  return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

function positionOf(combat: any): TurnPosition {
  return { round: Number(combat.round) || 0, turn: Number(combat.turn) || 0, combatantId: combat.combatant?.id ?? null };
}

function movedForward(before: TurnPosition, after: TurnPosition): boolean {
  return after.round > before.round || (after.round === before.round && after.turn > before.turn);
}

/** Only the active GM's client counts turns, so effects tick exactly once per turn. */
function watchTurnsForEffects(): void {
  const lastPositions = new Map<string, TurnPosition>();
  let queue: Promise<void> = Promise.resolve();
  Hooks.once("ready", () => {
    for (const combat of game.combats?.contents ?? []) if (combat.started) lastPositions.set(combat.id, positionOf(combat));
  });
  Hooks.on("updateCombat", (combat: any, change: Record<string, unknown>) => {
    if (!combat.started || !["round", "turn", "currentCombatantId", "started"].some((field) => Object.hasOwn(change, field))) return;
    const position = positionOf(combat);
    const previous = lastPositions.get(combat.id);
    lastPositions.set(combat.id, position);
    if (!isActiveGameMaster() || (previous && !movedForward(previous, position))) return;
    const endingId = previous?.combatantId ?? null;
    queue = queue.then(() => endTurn(combat, endingId)).then(() => startTurn(combat, position.combatantId));
  });
  Hooks.on("deleteCombat", (combat: any) => lastPositions.delete(combat.id));
}

async function endTurn(combat: any, combatantId: string | null): Promise<void> {
  const actor = combatantId ? combat.combatants?.get(combatantId)?.actor : null;
  const effects = actorEffects(actor);
  if (!actor || effects.length === 0) return;
  const remaining = afterOwnTurn(effects);
  const expired = effects.filter((effect) => !remaining.some((left) => left.id === effect.id));
  await safely(() => saveActorEffects(actor, remaining));
  if (expired.length > 0) await announce(actor, `${escapeHTML(expired.map((effect) => effect.name).join(", "))} acabou.`);
}

/** Rolls each effect's damage dice once; a formula that fails to roll counts as 0. */
async function rollEffectDice(effects: readonly AppliedEffect[]): Promise<{ totals: Map<string, number>; notes: string[] }> {
  const totals = new Map<string, number>();
  const notes: string[] = [];
  for (const effect of effects) {
    if (!dealsTurnDamage(effect) || !effect.damageDice) continue;
    try {
      const roll = await new Roll(effect.damageDice).evaluate();
      const total = Math.trunc(Number(roll.total) || 0);
      totals.set(effect.id, total);
      notes.push(`${escapeHTML(effect.name)}: ${escapeHTML(effect.damageDice)} = ${total}`);
    } catch {
      totals.set(effect.id, 0);
    }
  }
  return { totals, notes };
}

async function startTurn(combat: any, combatantId: string | null): Promise<void> {
  const actor = combatantId ? combat.combatants?.get(combatantId)?.actor : null;
  const effects = actorEffects(actor);
  if (!actor || effects.length === 0) return;
  const dice = await rollEffectDice(effects);
  const damage = turnStartDamage(effects, (effect) => dice.totals.get(effect.id) ?? 0);
  if (damage.size === 0) return;
  const readings = readActorResources(actor, statusResources());
  const update: Record<string, unknown> = {};
  const sources = escapeHTML(damageSources(effects));
  const lines: string[] = [];
  if (dice.notes.length > 0) lines.push(`Dados: ${dice.notes.join("; ")}.`);
  for (const [resourceId, amount] of damage) {
    const reading = readings.find((entry) => entry.resource.id === resourceId);
    if (!reading) continue;
    const edit = steppedValue(reading, -amount);
    Object.assign(update, resourceUpdate(reading, edit));
    const label = escapeHTML(reading.label);
    lines.push(amount >= 0 ? `${sources}: perdeu ${amount} de ${label} (agora ${edit.value}).` : `${sources}: recuperou ${-amount} de ${label} (agora ${edit.value}).`);
  }
  if (Object.keys(update).length === 0) return;
  await safely(() => actor.update(update));
  for (const line of lines) await announce(actor, line);
}

function damageSources(effects: readonly AppliedEffect[]): string {
  return effects
    .filter(dealsTurnDamage)
    .map((effect) => effect.name)
    .join(", ");
}

async function safely(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    ui.notifications.warn("Não foi possível atualizar os efeitos de um personagem.");
  }
}

async function announce(actor: any, text: string): Promise<void> {
  const content = `<p><strong>${escapeHTML(actor.name ?? "")}</strong></p><p>${text}</p>`;
  await safely(() => ChatMessage.create({ author: game.user.id, content, style: CONST.CHAT_MESSAGE_STYLES.OTHER, speaker: { scene: null, actor: actor.id, token: null, alias: actor.name } }));
}
