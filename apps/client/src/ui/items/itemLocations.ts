import { LOOT_FLAG, readChest } from "@tabbletop/protocol";

export interface ItemWhereabouts {
  /** Character name -> how many copies they carry. */
  carriedBy: Map<string, number>;
  /** Scene name -> how many copies lie on its floor. */
  onGround: Map<string, number>;
  /** Chest name -> how many copies it stores. */
  inChests: Map<string, number>;
}

interface ActorLike {
  name?: string;
  items?: Iterable<{ _source?: { flags?: { core?: { sourceId?: unknown } } } }>;
}

interface SceneLike {
  name?: string;
  tiles?: Iterable<{ _source?: { flags?: { core?: Record<string, any> } } }>;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function entryFor(index: Map<string, ItemWhereabouts>, sourceId: string): ItemWhereabouts {
  let entry = index.get(sourceId);
  if (!entry) {
    entry = { carriedBy: new Map(), onGround: new Map(), inChests: new Map() };
    index.set(sourceId, entry);
  }
  return entry;
}

/** One pass over every inventory and every map: where the copies of each Items-tab entry are now. */
export function indexItemWhereabouts(actors: Iterable<ActorLike>, scenes: Iterable<SceneLike>): Map<string, ItemWhereabouts> {
  const index = new Map<string, ItemWhereabouts>();
  for (const actor of actors) {
    for (const item of actor.items ?? []) {
      const sourceId = item._source?.flags?.core?.sourceId;
      if (typeof sourceId === "string") bump(entryFor(index, sourceId).carriedBy, actor.name ?? "?");
    }
  }
  for (const scene of scenes) {
    for (const tile of scene.tiles ?? []) {
      const sourceId = tile._source?.flags?.core?.[LOOT_FLAG]?.flags?.core?.sourceId;
      if (typeof sourceId === "string") bump(entryFor(index, sourceId).onGround, scene.name ?? "?");
      indexChestContents(index, tile._source?.flags?.core);
    }
  }
  return index;
}

function indexChestContents(index: Map<string, ItemWhereabouts>, coreFlags: unknown): void {
  const chest = readChest(coreFlags);
  for (const entry of chest?.entries ?? []) {
    const sourceId = (entry.item.flags as { core?: { sourceId?: unknown } } | undefined)?.core?.sourceId;
    if (typeof sourceId === "string") bump(entryFor(index, sourceId).inChests, chest!.name);
  }
}

function listed(map: Map<string, number>): string {
  return [...map].map(([name, count]) => (count > 1 ? `${name} (${count})` : name)).join(", ");
}

/** "Com Ana, Bruno (2) · No chão: Cripta", or null when no copy is out in the world. */
export function describeWhereabouts(whereabouts: ItemWhereabouts | undefined): string | null {
  if (!whereabouts) return null;
  const parts: string[] = [];
  if (whereabouts.carriedBy.size > 0) parts.push(`Com ${listed(whereabouts.carriedBy)}`);
  if (whereabouts.onGround.size > 0) parts.push(`No chão: ${listed(whereabouts.onGround)}`);
  if (whereabouts.inChests.size > 0) parts.push(`No baú: ${listed(whereabouts.inChests)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
