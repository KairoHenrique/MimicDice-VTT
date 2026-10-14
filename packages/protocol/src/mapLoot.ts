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
