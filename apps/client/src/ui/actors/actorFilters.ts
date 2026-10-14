import type { ActorCategory } from "@tabbletop/protocol";

export const FILTER_ALL = "all";
export const FILTER_PLAYERS = "players";

export interface FilterableActor {
  id: string;
  name: string;
  isPlayerCharacter: boolean;
}

function normalized(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/** Applies the selected chip ("all", the fixed "players" or a GM category id) and the name search. */
export function filterActors<T extends FilterableActor>(actors: readonly T[], filterId: string, categories: readonly ActorCategory[], query: string): T[] {
  const needle = normalized(query.trim());
  let members: Set<string> | null = null;
  if (filterId !== FILTER_ALL && filterId !== FILTER_PLAYERS) {
    members = new Set(categories.find((category) => category.id === filterId)?.actorIds ?? []);
  }
  return actors.filter((actor) => {
    if (filterId === FILTER_PLAYERS && !actor.isPlayerCharacter) return false;
    if (members && !members.has(actor.id)) return false;
    return needle === "" || normalized(actor.name).includes(needle);
  });
}

/** Category membership counts, ignoring ids of actors that no longer exist. */
export function countMembers(categories: readonly ActorCategory[], existingActorIds: ReadonlySet<string>): Map<string, number> {
  return new Map(categories.map((category) => [category.id, category.actorIds.filter((actorId) => existingActorIds.has(actorId)).length]));
}
