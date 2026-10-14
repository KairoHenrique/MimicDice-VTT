import { dropInventoryItemOnMap, moveItemToActor } from "./itemExchange";

/** Items handed to characters remember the Items-tab entry they came from, so the GM's later edits reach every copy. */

const SYNCED_FIELDS = ["name", "type", "img", "system"] as const;
const namesBeforeUpdate = new Map<string, string>();

function sourceIdOf(item: any): string | null {
  const value = item._source?.flags?.core?.sourceId;
  return typeof value === "string" ? value : null;
}

/** Data for an inventory copy of a world item (or of another copy, keeping the original source). */
export function inventoryCopyData(item: any): Record<string, unknown> {
  const source = item._source ?? {};
  return { name: item.name, type: item.type, img: source.img ?? null, system: foundry.utils.deepClone(source.system ?? {}), flags: { core: { sourceId: sourceIdOf(item) ?? item.uuid } } };
}

export async function giveItemToActor(actor: any, item: any): Promise<boolean> {
  if (!actor?.isOwner) {
    ui.notifications.warn("Você só pode dar itens para personagens seus.");
    return false;
  }
  await actor.createEmbeddedDocuments("Item", [inventoryCopyData(item)]);
  ui.notifications.info(`${actor.name} recebeu "${item.name}".`);
  return true;
}

/** Reads a dragged Items-tab entry (or inventory item); null for anything else. */
export function draggedItem(raw: string | undefined): any | null {
  try {
    const data = JSON.parse(raw ?? "");
    if (typeof data?.uuid !== "string") return null;
    const document = foundry.utils.fromUuidSync(data.uuid);
    return document?.documentName === "Item" ? document : null;
  } catch {
    return null;
  }
}

/** Copies made before 1.2.1 have no source id; they are matched by the item's name instead. */
function isCopyOf(candidate: any, original: any, previousName: string): boolean {
  const sourceId = sourceIdOf(candidate);
  if (sourceId) return sourceId === original.uuid;
  return candidate.name === previousName && candidate.type === original.type;
}

async function propagateEdit(original: any, changes: Record<string, unknown>): Promise<void> {
  const fields = SYNCED_FIELDS.filter((field) => field in changes);
  if (fields.length === 0) return;
  const previousName = namesBeforeUpdate.get(original.id) ?? original.name;
  namesBeforeUpdate.delete(original.id);
  const patch: Record<string, unknown> = Object.fromEntries(fields.map((field) => [field, field === "system" ? foundry.utils.deepClone(changes.system) : original._source[field]]));
  for (const actor of game.actors.contents as any[]) {
    const copies = (Array.from(actor.items?.values() ?? []) as any[]).filter((candidate) => isCopyOf(candidate, original, previousName));
    if (copies.length === 0) continue;
    await actor.updateEmbeddedDocuments("Item", copies.map((copy) => ({ _id: copy.id, ...patch, flags: { core: { sourceId: original.uuid } } })));
  }
}

/** The GM's edit of an Items-tab entry updates the copies in every inventory; dropping an item on a token gives it. */
const WHEREABOUTS_REFRESH_MS = 250;

/** The GM's Items tab shows who carries each item, so inventory and loot changes redraw it (batched). */
function refreshItemWhereabouts(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (!game.user.isGM || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void ui.items?.render();
    }, WHEREABOUTS_REFRESH_MS);
  };
  for (const hook of ["createItem", "deleteItem", "createTile", "deleteTile", "deleteActor", "updateActor"]) Hooks.on(hook, schedule);
  Hooks.on("updateTile", (_tile: unknown, changes: any) => {
    if (changes?.flags?.core) schedule();
  });
}

export function installInventorySync(): void {
  refreshItemWhereabouts();
  Hooks.on("preUpdateItem", (item: any) => {
    if (!item.parent && game.user.isGM) namesBeforeUpdate.set(item.id, item.name);
  });
  Hooks.on("updateItem", (item: any, changes: Record<string, unknown>, _options: unknown, userId: string) => {
    if (item.parent || userId !== game.user.id || !game.user.isGM) return;
    void propagateEdit(item, changes).catch(() => ui.notifications.warn("Não foi possível atualizar o item em todos os inventários."));
  });
  Hooks.on("dropCanvasData", (_canvas: unknown, data: Record<string, unknown>) => {
    const item = typeof data.uuid === "string" ? foundry.utils.fromUuidSync(data.uuid) : null;
    if (item?.documentName !== "Item") return true;
    const point = { x: Number(data.x), y: Number(data.y) };
    const token = (canvas.tokens?.placeables ?? []).find((candidate: any) => {
      const { x, y, width, height } = candidate.bounds;
      return candidate.visible && point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
    });
    if (token?.actor && token.actor !== item.parent) {
      void moveItemToActor(item, token.actor);
      return false;
    }
    if (!item.parent) return true;
    if (!token) void dropInventoryItemOnMap(item, point);
    return false;
  });
}
