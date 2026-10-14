import { CHEST_FLAG, chestSchema, LOOT_REACH_SQUARES, MAX_CHEST_ENTRIES, movableItemData, newChestEntryId, readChest, SOCKET_EVENTS, type Chest, type ChestPutRequest, type ChestTakeRequest } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { inventoryCopyData } from "../../ui/items/inventorySync";

type ChestResponse = { ok: true; name: string } | { error: string };

let chestSocket: Socket | null = null;

export function connectChestActions(socket: Socket): void {
  chestSocket = socket;
}

export function chestOf(tile: any): Chest | null {
  return readChest(tile?.document?._source?.flags?.core);
}

function emit(event: string, request: ChestTakeRequest | ChestPutRequest, success: (name: string) => string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!chestSocket) return resolve(false);
    chestSocket.emit(event, request, (response: ChestResponse) => {
      if ("error" in response) ui.notifications.warn(response.error);
      else ui.notifications.info(success(response.name));
      resolve(!("error" in response));
    });
  });
}

/** Distance from a token's center to the closest edge of the tile, in grid squares. */
function squaresBetween(token: any, tile: any): number {
  const { x, y, width, height } = tile.bounds;
  const center = token.center;
  const closestX = Math.min(Math.max(center.x, x), x + width);
  const closestY = Math.min(Math.max(center.y, y), y + height);
  return Math.hypot(center.x - closestX, center.y - closestY) / (canvas.grid.size || 100);
}

/** The player's character tokens close enough to use the chest, nearest first. */
export function ownTokensInReach(tile: any): any[] {
  const owned = ((canvas.tokens?.placeables ?? []) as any[]).filter((token) => token.document.actorId && token.actor?.isOwner);
  return owned.filter((token) => squaresBetween(token, tile) <= LOOT_REACH_SQUARES).sort((left, right) => squaresBetween(left, tile) - squaresBetween(right, tile));
}

export function takeFromChest(tile: any, entryId: string, actor: any): Promise<boolean> {
  return emit(SOCKET_EVENTS.CHEST_TAKE, { sceneId: canvas.scene.id, tileId: tile.id, actorId: actor.id, entryId }, (name) => `${actor.name} pegou "${name}" do baú.`);
}

export function putInChest(tile: any, item: any): Promise<boolean> {
  return emit(SOCKET_EVENTS.CHEST_PUT, { sceneId: canvas.scene.id, tileId: tile.id, actorId: item.parent.id, itemId: item.id }, (name) => `"${name}" foi guardado no baú.`);
}

/** GM edits go straight to the tile; the schema keeps the stored chest well-formed. */
export function saveChestAsGameMaster(tile: any, chest: Chest): Promise<unknown> {
  return tile.document.update({ [`flags.core.${CHEST_FLAG}`]: chestSchema.parse(chest) });
}

/** GM: an Items-tab entry is copied in; an item carried by someone is moved in. */
export async function addItemAsGameMaster(tile: any, item: any): Promise<void> {
  const chest = chestOf(tile);
  if (!chest) return;
  if (chest.entries.length >= MAX_CHEST_ENTRIES) {
    ui.notifications.warn("O baú está cheio.");
    return;
  }
  const data = movableItemData(inventoryCopyData(item));
  if (!data) return;
  await saveChestAsGameMaster(tile, { ...chest, entries: [...chest.entries, { id: newChestEntryId(chest.entries), item: data, perceptionDc: null }] });
  if (item.parent) await item.delete();
  ui.notifications.info(`"${item.name}" foi guardado em ${chest.name}.`);
}

/** Visible chest tiles under a canvas point. */
export function chestTilesAt(point: { x: number; y: number }): any[] {
  return ((canvas.tiles?.placeables ?? []) as any[]).filter((tile) => {
    if (!tile.visible || !chestOf(tile)) return false;
    const { x, y, width, height } = tile.bounds;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  });
}

/** Visible chest tiles a token can reach. */
export function chestTilesNear(token: any): any[] {
  return ((canvas.tiles?.placeables ?? []) as any[]).filter((tile) => tile.visible && chestOf(tile) && squaresBetween(token, tile) <= LOOT_REACH_SQUARES);
}
