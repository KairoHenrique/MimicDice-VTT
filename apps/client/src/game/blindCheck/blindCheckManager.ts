import {
  groupBlindCheckBroadcastSchema,
  groupBlindCheckRequestSchema,
  groupBlindCheckRollSchema,
  SOCKET_EVENTS,
  type GroupBlindCheckBroadcast,
  type GroupBlindCheckRequest,
  type GroupBlindCheckRoll,
  type SheetLayout,
} from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { playerCharacters } from "../concealment/perception";
import { findOwnCharacter } from "../../ui/actors/ownCharacter";
import { LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE } from "../../ui/actors/actorRoles";
import { allComponents, EMPTY_LAYOUT, readLayout } from "../../ui/sheets/layout/sheetLayoutRules";
import { DEFAULT_SKILL_LABELS, readSkillValues } from "../../ui/sheets/layout/skillList";
import { BoardContext } from "../../ui/sheets/layout/boardContext";
import { attributesForSkillRoll, skillRollFormula, type AttributeChoice } from "../../ui/sheets/layout/skillAttributeRoll";
import { playAlertSound, playDiceSound } from "../audio/soundEffects";
import { showPlayerBlindPrompt } from "./PlayerBlindPrompt";
import { openBlindCheckTracker, updateBlindCheckTrackerRoll } from "./BlindCheckTracker";

export interface ActiveBlindCheck extends GroupBlindCheckRequest {
  startedAt: number;
  results: Map<string, BlindCheckResult>;
}

export interface BlindCheckResult {
  actorId: string;
  actorName: string;
  total: number;
  formula: string;
  attributeLabel: string;
  skillPoints: number;
  passed: boolean | null;
  rolledAt: number;
}

let blindCheckSocket: Socket | null = null;
let currentGmCheck: ActiveBlindCheck | null = null;

export function registerBlindCheckSocket(socket: Socket): void {
  blindCheckSocket = socket;
}

/** Collects all distinct skill names from player characters and default list. */
export function collectAvailableSkills(): string[] {
  const set = new Set<string>();
  for (const actor of playerCharacters()) {
    const layout = readLayout(actor.getFlag?.(MIMICDICE_FLAG_SCOPE, LAYOUT_FLAG_KEY)) ?? EMPTY_LAYOUT;
    for (const comp of allComponents(layout)) {
      if (comp.kind === "skills" && comp.skills) {
        for (const skill of comp.skills) {
          if (skill.label?.trim()) set.add(skill.label.trim());
        }
      }
    }
  }
  for (const label of DEFAULT_SKILL_LABELS) {
    set.add(label);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
}

/** Reads skill points for a given skill label on an actor. */
export function actorSkillPoints(context: BoardContext, layout: SheetLayout, skillLabel: string): number {
  const norm = skillLabel.trim().toLocaleLowerCase();
  const components = allComponents(layout).filter((c) => c.kind === "skills" && c.key);
  for (const comp of components) {
    const skills = comp.skills ?? [];
    const values = readSkillValues(context.store.read(comp.key!), skills, typeof comp.initial === "number" ? comp.initial : 0);
    const matched = skills.find((s) => s.label.trim().toLocaleLowerCase() === norm || s.key.toLowerCase() === norm);
    if (matched) return values[matched.key] ?? 0;
  }
  return 0;
}

/** Resolves the chosen or best attribute for an actor's skill roll. */
export function resolveActorAttribute(context: BoardContext, layout: SheetLayout, preferredKey?: string | null): AttributeChoice {
  const choices = attributesForSkillRoll(context, layout);
  if (choices.length === 0) {
    return { key: "d20", label: "Padrão", value: 1 };
  }
  if (preferredKey && preferredKey !== "auto") {
    const found = choices.find((c) => c.key === preferredKey);
    if (found) return found;
  }
  // If auto or not found: choose the highest attribute score
  return choices.reduce((best, cur) => (cur.value > best.value ? cur : best), choices[0]);
}

/** GM sends a group blind check to all players. */
export function startGroupBlindCheck(request: GroupBlindCheckRequest): void {
  if (!blindCheckSocket) return;
  currentGmCheck = {
    ...request,
    startedAt: Date.now(),
    results: new Map(),
  };
  blindCheckSocket.emit(SOCKET_EVENTS.GROUP_BLIND_CHECK, request);
  openBlindCheckTracker(currentGmCheck);
  ui.notifications.info(`Pedido de rolagem cega enviado para ${request.targetActorIds.length} jogador(es)!`);
}

/** GM rolls for a character directly (e.g. if the player is away or requested by GM). */
export async function executeBlindRollForActor(actorId: string): Promise<BlindCheckResult | null> {
  if (!currentGmCheck) return null;
  const actor = game.actors.get(actorId);
  if (!actor) return null;

  const layout = readLayout(actor.getFlag?.(MIMICDICE_FLAG_SCOPE, LAYOUT_FLAG_KEY)) ?? EMPTY_LAYOUT;
  const context = new BoardContext(actor, layout, false);
  const skillPoints = actorSkillPoints(context, layout, currentGmCheck.skillLabel);
  const attribute = resolveActorAttribute(context, layout, currentGmCheck.attributeKey);

  const formula = skillRollFormula(attribute.key, skillPoints);
  const rollData = { ...(actor.getRollData?.() ?? {}), ...context.extraRollData() };
  const roll = Roll.create(formula, rollData);
  await roll.evaluate();

  const total = Number(roll.total) || 0;
  const passed = typeof currentGmCheck.dc === "number" && currentGmCheck.dc > 0 ? total >= currentGmCheck.dc : null;

  const dcText = currentGmCheck.dc ? ` (DT ${currentGmCheck.dc} - ${passed ? "Passou" : "Falhou"})` : "";
  const flavor = `🎲 Teste às Cegas: ${currentGmCheck.skillLabel} (${attribute.label})${dcText}`;

  await roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor,
    },
    {
      rollMode: "blindroll",
    },
  );

  playDiceSound();

  const result: BlindCheckResult = {
    actorId,
    actorName: actor.name,
    total,
    formula: roll.formula,
    attributeLabel: attribute.label,
    skillPoints,
    passed,
    rolledAt: Date.now(),
  };

  currentGmCheck.results.set(actorId, result);
  updateBlindCheckTrackerRoll(currentGmCheck, result);
  return result;
}

/** Player submits participation to roll. */
export function submitPlayerBlindRoll(checkId: string, actorId: string): void {
  if (!blindCheckSocket) return;
  blindCheckSocket.emit(SOCKET_EVENTS.GROUP_BLIND_CHECK_ROLL, { checkId, actorId });
}

/** Setup listeners for incoming group blind check broadcasts and player roll triggers. */
export function listenForGroupBlindChecks(socket: Socket): void {
  registerBlindCheckSocket(socket);

  // Incoming check request to players
  socket.on(SOCKET_EVENTS.GROUP_BLIND_CHECK, (payload: unknown) => {
    const parsed = groupBlindCheckBroadcastSchema.safeParse(payload);
    if (!parsed.success) return;

    // Check if the current user owns any of the target actors
    const myActor = findOwnCharacter(game.user);
    const targetActors = playerCharacters().filter((actor) => parsed.data.targetActorIds.includes(actor.id) && (actor.isOwner || (myActor && myActor.id === actor.id)));

    if (targetActors.length > 0 && !game.user.isGM) {
      playAlertSound();
      showPlayerBlindPrompt(parsed.data, targetActors);
    }
  });

  // Incoming player roll trigger to GM
  socket.on(SOCKET_EVENTS.GROUP_BLIND_CHECK_ROLL, (payload: unknown) => {
    const parsed = groupBlindCheckRollSchema.safeParse(payload);
    if (!parsed.success) return;

    if (game.user.isGM && currentGmCheck && currentGmCheck.checkId === parsed.data.checkId) {
      void executeBlindRollForActor(parsed.data.actorId);
    }
  });
}
