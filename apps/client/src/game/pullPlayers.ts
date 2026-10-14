import { actorTokenData, type MenuEntry } from "@tabbletop/api";
import { SOCKET_EVENTS } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { findOwnCharacter } from "../ui/actors/ownCharacter";

const PULL_TIMEOUT_MS = 5_000;

interface Point {
  x: number;
  y: number;
}

interface PullTarget {
  user: any;
  actor: any;
}

function pullTargets(): PullTarget[] {
  const targets: PullTarget[] = [];
  for (const user of game.users.contents) {
    const actor = findOwnCharacter(user);
    if (actor) targets.push({ user, actor });
  }
  return targets;
}

/** Grid offsets ordered by distance from the clicked cell, so pulled tokens gather around it without stacking. */
function gatheringOffsets(count: number): Point[] {
  const offsets: Point[] = [];
  for (let ring = 0; offsets.length < count; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) offsets.push({ x: dx, y: dy });
      }
    }
  }
  return offsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)).slice(0, count);
}

function snappedCorner(center: Point, width: number, height: number): Point {
  const gridSize = canvas.grid.size;
  return canvas.grid.getSnappedPoint({ x: center.x - (width * gridSize) / 2, y: center.y - (height * gridSize) / 2 }, { mode: "corner" });
}

function tokensOfActorElsewhere(actorId: string, sceneId: string): any[] {
  const found: any[] = [];
  for (const scene of game.scenes.contents) {
    if (scene.id === sceneId) continue;
    for (const token of scene.tokens.contents) if (token.actorId === actorId) found.push(token);
  }
  return found;
}

/** Moves the character's token here: reuses the one on this scene, else brings the one from another scene, else creates it. */
async function placeCharacterToken(actor: any, center: Point): Promise<void> {
  const scene = canvas.scene;
  const here = scene.tokens.contents.find((token: any) => token.actorId === actor.id);
  if (here) {
    await here.update(snappedCorner(center, Number(here.width) || 1, Number(here.height) || 1));
    return;
  }
  const [elsewhere, ...duplicates] = tokensOfActorElsewhere(actor.id, scene.id);
  if (!elsewhere) {
    await scene.createEmbeddedDocuments("Token", [actorTokenData(actor, center.x, center.y, canvas)]);
    return;
  }
  const { _id, ...source } = elsewhere.toObject();
  await scene.createEmbeddedDocuments("Token", [{ ...source, ...snappedCorner(center, Number(source.width) || 1, Number(source.height) || 1) }]);
  await elsewhere.delete();
  for (const duplicate of duplicates) await duplicate.delete();
}

async function pullTargetsTo(socket: Socket, targets: PullTarget[], point: Point): Promise<void> {
  const scene = canvas.scene;
  if (!scene || !canvas.ready || targets.length === 0) return;
  const gridSize = canvas.grid.size;
  const offsets = gatheringOffsets(targets.length);
  try {
    for (const [index, target] of targets.entries()) {
      const offset = offsets[index] ?? { x: 0, y: 0 };
      await placeCharacterToken(target.actor, { x: point.x + offset.x * gridSize, y: point.y + offset.y * gridSize });
    }
  } catch {
    ui.notifications.error("Não foi possível mover todos os tokens. Tente de novo.");
    return;
  }
  const view = { x: point.x, y: point.y, scale: canvas.stage.scale.x };
  const userIds = targets.map((target) => target.user.id);
  const response = (await socket.timeout(PULL_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.PULL_TO_SCENE, { sceneId: scene.id, view, userIds }).catch(() => ({ error: "Sem resposta do servidor" }))) as { error?: string };
  if (response.error) ui.notifications.warn(`Tokens movidos, mas as telas dos jogadores não foram levadas: ${response.error}`);
  else ui.notifications.info(targets.length === 1 ? `${targets[0]!.actor.name} foi puxado para cá.` : `${targets.length} jogadores foram puxados para cá.`);
}

export function pullMenuEntries(socket: Socket, point: Point): MenuEntry[] {
  const targets = pullTargets();
  if (targets.length === 0) return [{ heading: true, label: "Nenhum jogador tem personagem ainda", icon: "fa-solid fa-user-slash" }];
  const entries: MenuEntry[] = [{ heading: true, label: "Puxar para cá", icon: "fa-solid fa-people-pulling" }];
  if (targets.length > 1) entries.push({ label: "Todos os jogadores", icon: "fa-solid fa-users", onSelect: () => void pullTargetsTo(socket, targets, point) });
  for (const target of targets) {
    const status = target.user.active ? "" : " (offline)";
    entries.push({ label: `${target.actor.name} - ${target.user.name}${status}`, icon: "fa-solid fa-user", onSelect: () => void pullTargetsTo(socket, [target], point) });
  }
  return entries;
}