import { escapeHTML, type MenuEntry } from "@tabbletop/api";
import { isArmedTrap, readConcealment, TRAP_FLAG, type Trap } from "@tabbletop/protocol";
import { applyEffectToActors, effectDefinitions } from "../../ui/effects/effectStore";
import { concealmentDialog } from "./concealmentDialog";

/** Trap tiles already firing, so a burst of moves never triggers the same trap twice. */
const firing = new Set<string>();

function trapOf(tileDocument: any): Trap | null {
  return readConcealment(tileDocument?._source?.flags?.world).trap;
}

/** One GM client fires traps, so two open GM windows never fire the same one twice. */
function isTrapClient(): boolean {
  return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

function tokenCenter(tokenDocument: any, gridSize: number): { x: number; y: number } {
  return { x: Number(tokenDocument.x) + ((Number(tokenDocument.width) || 1) * gridSize) / 2, y: Number(tokenDocument.y) + ((Number(tokenDocument.height) || 1) * gridSize) / 2 };
}

function contains(tileDocument: any, point: { x: number; y: number }): boolean {
  const x = Number(tileDocument.x);
  const y = Number(tileDocument.y);
  return point.x >= x && point.x <= x + Number(tileDocument.width) && point.y >= y && point.y <= y + Number(tileDocument.height);
}

function tokensInside(tileDocument: any): any[] {
  const scene = tileDocument.parent;
  const gridSize = Number(scene?.grid?.size) || 100;
  return (scene?.tokens?.contents ?? []).filter((tokenDocument: any) => contains(tileDocument, tokenCenter(tokenDocument, gridSize)));
}

async function announce(trap: Trap, victims: any[]): Promise<void> {
  const who = victims.length ? victims.map((tokenDocument) => escapeHTML(tokenDocument.name ?? "Alguém")).join(", ") : "Ninguém";
  const message = trap.message ? `<p>${escapeHTML(trap.message)}</p>` : "";
  await ChatMessage.create({ content: `<p><strong>Armadilha!</strong> ${who} ativou <em>${escapeHTML(trap.name)}</em>.</p>${message}` });
}

async function applyTrapEffect(trap: Trap, victims: any[]): Promise<void> {
  const definition = trap.effectId ? effectDefinitions().find((entry) => entry.id === trap.effectId) : null;
  const actors = [...new Map(victims.map((tokenDocument) => tokenDocument.actor).filter(Boolean).map((actor: any) => [actor.id, actor])).values()];
  if (!definition || actors.length === 0) return;
  await applyEffectToActors(actors, definition, { turns: trap.effectTurns });
}

/** Reveals the trap to everyone, warns in the chat and applies its effect to whoever stands on it. */
export async function fireTrap(tileDocument: any, victims: any[] = tokensInside(tileDocument)): Promise<void> {
  const trap = trapOf(tileDocument);
  if (!trap || firing.has(tileDocument.uuid)) return;
  firing.add(tileDocument.uuid);
  try {
    await tileDocument.update({ [`flags.world.${TRAP_FLAG}.triggered`]: true });
    await Promise.all([announce(trap, victims), applyTrapEffect(trap, victims)]);
  } finally {
    firing.delete(tileDocument.uuid);
  }
}

function rearm(tileDocument: any): Promise<unknown> {
  return tileDocument.update({ [`flags.world.${TRAP_FLAG}.triggered`]: false });
}

async function checkTraps(tokenDocument: any): Promise<void> {
  const scene = tokenDocument.parent;
  const center = tokenCenter(tokenDocument, Number(scene?.grid?.size) || 100);
  const sprung = (scene?.tiles?.contents ?? []).filter((tileDocument: any) => isArmedTrap(readConcealment(tileDocument._source?.flags?.world)) && contains(tileDocument, center));
  for (const tileDocument of sprung) await fireTrap(tileDocument, [tokenDocument]);
}

function tileMenuEntries(tile: any): MenuEntry[] {
  const entries: MenuEntry[] = [{ label: "Percepção e armadilha", icon: "fa-solid fa-eye-low-vision", onSelect: () => concealmentDialog(tile.document) }];
  const trap = trapOf(tile.document);
  if (trap && !trap.triggered) entries.push({ label: "Ativar armadilha agora", icon: "fa-solid fa-burst", onSelect: () => fireTrap(tile.document) });
  if (trap?.triggered) entries.push({ label: "Rearmar armadilha (esconder de novo)", icon: "fa-solid fa-rotate-left", onSelect: () => rearm(tile.document) });
  return entries;
}

/** Traps fire when a token's center lands on them; the GM configures them (and perception DCs) from the right-click menu. */
export function installTraps(): void {
  Hooks.on("updateToken", (tokenDocument: any, changes: Record<string, unknown>) => {
    if ((!("x" in changes) && !("y" in changes)) || !isTrapClient()) return;
    void checkTraps(tokenDocument).catch(() => ui.notifications.warn("Não foi possível disparar a armadilha."));
  });
  Hooks.on("getTileMenuEntries", (tile: any, entries: MenuEntry[]) => {
    if (game.user.isGM) entries.unshift(...tileMenuEntries(tile));
  });
  Hooks.on("getNoteMenuEntries", (note: any, entries: MenuEntry[]) => {
    if (game.user.isGM) entries.push({ label: "Percepção (DT)", icon: "fa-solid fa-eye-low-vision", onSelect: () => concealmentDialog(note.document) });
  });
}
