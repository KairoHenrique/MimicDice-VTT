import { ACTOR_ROLES, type ActorRole } from "@tabbletop/protocol";

export const MIMICDICE_FLAG_SCOPE = "world";
export const ROLE_FLAG_KEY = "role";
export const LAYOUT_FLAG_KEY = "sheetLayout";
const OWNER_LEVEL = 3;

export const ROLE_PRESENTATION: Readonly<Record<ActorRole, { label: string; plural: string; icon: string }>> = Object.freeze({
  player: { label: "Jogador", plural: "Jogadores", icon: "fa-solid fa-user-shield" },
  enemy: { label: "Inimigo", plural: "Inimigos", icon: "fa-solid fa-skull" },
  npc: { label: "NPC", plural: "NPCs", icon: "fa-solid fa-user-tag" },
});

export function isActorRole(value: unknown): value is ActorRole {
  return typeof value === "string" && (ACTOR_ROLES as readonly string[]).includes(value);
}

/** Non-GM users holding OWNER over the actor, read from the stored ownership map. */
export function playerOwnersOf(actor: any): any[] {
  const ownership: Record<string, number> = actor._source?.ownership ?? {};
  return game.users.contents.filter((user: any) => !user.isGM && ownership[user.id] === OWNER_LEVEL);
}

/** Explicit role flag first; older actors without one count as players when a player owns them. */
export function actorRole(actor: any): ActorRole {
  const stored = actor.getFlag?.(MIMICDICE_FLAG_SCOPE, ROLE_FLAG_KEY);
  if (isActorRole(stored)) return stored;
  return playerOwnersOf(actor).length > 0 ? "player" : "npc";
}

export function isPlayerCharacter(actor: any): boolean {
  return actorRole(actor) === "player";
}
