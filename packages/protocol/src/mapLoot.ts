import { z } from "zod";

/** Tile flag (scope "core") holding the item a dropped loot tile gives to whoever picks it up. */
export const LOOT_FLAG = "loot";
/** How far (in grid squares, from the token's center to the item's edge) a character may reach to pick an item up. */
export const LOOT_REACH_SQUARES = 1.5;

const documentIdSchema = z.string().regex(/^[A-Za-z0-9]{16}$/);

export const lootItemSchema = z.object({
  name: z.string().trim().min(1).max(256),
  type: z.string().max(64),
  img: z.string().max(1024).nullable().default(null),
  system: z.record(z.string(), z.unknown()).default({}),
  flags: z.object({ core: z.object({ sourceId: z.string().max(200).optional() }).default({}) }).default({ core: {} }),
});
export type LootItem = z.infer<typeof lootItemSchema>;

export const lootPickupRequestSchema = z.object({
  sceneId: documentIdSchema,
  tileId: documentIdSchema,
  actorId: documentIdSchema,
});
export type LootPickupRequest = z.infer<typeof lootPickupRequestSchema>;

const MAP_COORDINATE_LIMIT = 1_000_000;
const mapCoordinateSchema = z.number().finite().min(-MAP_COORDINATE_LIMIT).max(MAP_COORDINATE_LIMIT);

/** A player leaves an item from their character's inventory on the map, next to that character's token. */
export const lootDropRequestSchema = z.object({
  sceneId: documentIdSchema,
  actorId: documentIdSchema,
  itemId: documentIdSchema,
  x: mapCoordinateSchema,
  y: mapCoordinateSchema,
});
export type LootDropRequest = z.infer<typeof lootDropRequestSchema>;

/** A player hands an item from their character to another character standing on the same scene. */
export const itemTransferRequestSchema = z.object({
  sceneId: documentIdSchema,
  fromActorId: documentIdSchema,
  itemId: documentIdSchema,
  toActorId: documentIdSchema,
});
export type ItemTransferRequest = z.infer<typeof itemTransferRequestSchema>;

/** Inventory data that moves with an item: what a loot tile or another character receives. */
export function movableItemData(item: Record<string, unknown>): LootItem | null {
  const flags = (item.flags ?? {}) as { core?: { sourceId?: unknown } };
  const sourceId = typeof flags.core?.sourceId === "string" ? flags.core.sourceId : undefined;
  const parsed = lootItemSchema.safeParse({ name: item.name, type: item.type, img: item.img ?? null, system: item.system ?? {}, flags: { core: sourceId ? { sourceId } : {} } });
  return parsed.success ? parsed.data : null;
}
