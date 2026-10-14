import { z } from "zod";
import { isConcealedFrom, perceptionDcSchema, readConcealment } from "./concealment";
import { lootItemSchema } from "./mapLoot";

/** Tile flag (scope "core") turning a map object into a chest that stores items. */
export const CHEST_FLAG = "chest";
export const MAX_CHEST_ENTRIES = 100;

const documentIdSchema = z.string().regex(/^[A-Za-z0-9]{16}$/);
const entryIdSchema = z.string().regex(/^[A-Za-z0-9]{1,16}$/);

export const chestEntrySchema = z.object({
  id: entryIdSchema,
  item: lootItemSchema,
  /** Only characters whose perception reaches it notice this item inside the chest. */
  perceptionDc: perceptionDcSchema.nullable().default(null),
});
export type ChestEntry = z.infer<typeof chestEntrySchema>;

export const chestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  entries: z.array(chestEntrySchema).max(MAX_CHEST_ENTRIES).default([]),
});
export type Chest = z.infer<typeof chestSchema>;

export const chestTakeRequestSchema = z.object({ sceneId: documentIdSchema, tileId: documentIdSchema, actorId: documentIdSchema, entryId: entryIdSchema });
export type ChestTakeRequest = z.infer<typeof chestTakeRequestSchema>;

export const chestPutRequestSchema = z.object({ sceneId: documentIdSchema, tileId: documentIdSchema, actorId: documentIdSchema, itemId: documentIdSchema });
export type ChestPutRequest = z.infer<typeof chestPutRequestSchema>;

export function readChest(coreFlags: unknown): Chest | null {
  const parsed = chestSchema.safeParse((coreFlags as Record<string, unknown> | null | undefined)?.[CHEST_FLAG]);
  return parsed.success ? parsed.data : null;
}

export function noticesChestEntry(entry: ChestEntry, perception: number | null): boolean {
  return entry.perceptionDc === null || (perception !== null && perception >= entry.perceptionDc);
}

/** What a character with this perception finds in the chest (nothing when the chest itself is hidden from them). */
export function visibleChestEntries(tile: { flags?: Record<string, any> }, perception: number | null): ChestEntry[] {
  const chest = readChest(tile.flags?.core);
  if (!chest || isConcealedFrom(readConcealment(tile.flags?.world), perception)) return [];
  return chest.entries.filter((entry) => noticesChestEntry(entry, perception));
}

export function newChestEntryId(existing: readonly ChestEntry[], random: () => number = Math.random): string {
  const taken = new Set(existing.map((entry) => entry.id));
  for (;;) {
    const id = Math.floor(random() * 36 ** 10).toString(36).padStart(10, "0").slice(0, 10);
    if (!taken.has(id)) return id;
  }
}
