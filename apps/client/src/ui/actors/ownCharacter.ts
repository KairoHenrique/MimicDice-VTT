import { actorRole } from "./actorRoles";

const OWNER_LEVEL = 3;

/** The character a player plays: the one linked to the user, else the first player-role actor they own. */
export function findOwnCharacter(user: any): any | null {
  if (!user || user.isGM) return null;
  const linked = user.character;
  if (linked) return linked;
  return game.actors.contents.find((actor: any) => actor._source?.ownership?.[user.id] === OWNER_LEVEL && actorRole(actor) === "player") ?? null;
}

export function needsOwnCharacter(user: any): boolean {
  return Boolean(user) && !user.isGM && findOwnCharacter(user) === null;
}
