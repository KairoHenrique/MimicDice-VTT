import type { Server } from "socket.io";
import { isGameMasterRole } from "@tabbletop/common";
import type { ModificationOutcome } from "../documents/DocumentService";
import type { ActiveWorld } from "../world/ActiveWorld";
import { broadcastToEveryViewer } from "./documentHandlers";
import { SERVER_GAME_MASTER } from "./lootPickupHandler";
import type { PresenceTracker } from "./PresenceTracker";

const MAX_LISTED_NAMES = 10;
const MAX_NAME_LENGTH = 80;

interface AbilitySummary {
  name: string;
  signature: string;
}

function abilitiesOf(source: Record<string, any> | null): AbilitySummary[] {
  const list = source?.flags?.world?.abilities;
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({ name: String(entry.name ?? "").slice(0, MAX_NAME_LENGTH) || "(sem nome)", signature: JSON.stringify([entry.name, entry.description, entry.rolls]) }));
}

function namesNotIn(source: AbilitySummary[], other: AbilitySummary[]): string[] {
  const remaining = other.map((entry) => entry.name);
  const missing: string[] = [];
  for (const entry of source) {
    const index = remaining.indexOf(entry.name);
    if (index >= 0) remaining.splice(index, 1);
    else missing.push(entry.name);
  }
  return missing;
}

/** Plain-language lines describing how a character's abilities changed; empty when nothing did. */
export function describeAbilityChanges(before: Record<string, any> | null, after: Record<string, any> | null): string[] {
  const previous = abilitiesOf(before);
  const next = abilitiesOf(after);
  if (JSON.stringify(previous) === JSON.stringify(next)) return [];
  const added = namesNotIn(next, previous);
  const removed = namesNotIn(previous, next);
  const previousByName = new Map(previous.map((entry) => [entry.name, entry.signature]));
  const edited = next.filter((entry) => previousByName.has(entry.name) && previousByName.get(entry.name) !== entry.signature).map((entry) => entry.name);
  const lines: string[] = [];
  const list = (names: string[]) => names.slice(0, MAX_LISTED_NAMES).join(", ") + (names.length > MAX_LISTED_NAMES ? "…" : "");
  if (added.length) lines.push(`Adicionou: ${list(added)}`);
  if (removed.length) lines.push(`Removeu: ${list(removed)}`);
  if (edited.length) lines.push(`Editou: ${list(edited)}`);
  if (lines.length === 0) lines.push("Mudou a ordem das habilidades");
  return lines;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** When a player edits a character's abilities, the GMs get a private chat note saying who changed what. */
export async function auditAbilityChanges(io: Server, presence: PresenceTracker, world: ActiveWorld, outcome: ModificationOutcome, requester: { userId: string; role: number }): Promise<void> {
  if (isGameMasterRole(requester.role) || outcome.definition.name !== "Actor" || outcome.response.action !== "update") return;
  const gameMasters = world.users.listPublicUsers().filter((user) => isGameMasterRole(user.role)).map((user) => user._id);
  if (gameMasters.length === 0) return;
  const author = escapeHtml(world.users.getUser(requester.userId)?.name ?? "Um jogador");
  const messages = outcome.affected.flatMap(({ before, after }) => {
    const lines = describeAbilityChanges(before, after);
    if (lines.length === 0) return [];
    const character = escapeHtml(String(after?.name ?? before?.name ?? "um personagem"));
    const content = `<p><strong>Habilidades alteradas</strong>: ${author} mudou a ficha de ${character}.</p><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
    return [{ content, whisper: gameMasters, speaker: { scene: null, actor: null, token: null, alias: "Auditoria" }, flags: { core: { abilityAudit: true } } }];
  });
  if (messages.length === 0) return;
  const created = await world.documents.modify({ type: "ChatMessage", action: "create", operation: { data: messages, parentUuid: null } }, SERVER_GAME_MASTER);
  broadcastToEveryViewer(io, presence, world, created);
}
