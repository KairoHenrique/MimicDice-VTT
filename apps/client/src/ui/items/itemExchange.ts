import { SOCKET_EVENTS, type ItemTransferRequest, type LootDropRequest } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { giveItemToActor, inventoryCopyData } from "./inventorySync";

type ExchangeResponse = { ok: true; name: string } | { error: string };

let exchangeSocket: Socket | null = null;

export function registerItemExchange(socket: Socket): void {
  exchangeSocket = socket;
}

function emit(event: string, request: ItemTransferRequest | LootDropRequest, success: (name: string) => string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!exchangeSocket) return resolve(false);
    exchangeSocket.emit(event, request, (response: ExchangeResponse) => {
      if ("error" in response) ui.notifications.warn(response.error);
      else ui.notifications.info(success(response.name));
      resolve(!("error" in response));
    });
  });
}

/** Marks an inventory row as a drag source carrying the item, like the Items tab does. */
export function makeItemDraggable(row: HTMLElement, item: any): void {
  row.draggable = true;
  row.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
}

/**
 * Items-tab entries are copied into the inventory; an item carried by another character moves. When the user owns
 * both characters it moves directly, otherwise the server checks the hand-over.
 */
export async function moveItemToActor(item: any, target: any): Promise<boolean> {
  const holder = item.parent;
  if (!holder) return giveItemToActor(target, item);
  if (holder === target) return false;
  if (holder.isOwner && target.isOwner) {
    await target.createEmbeddedDocuments("Item", [{ ...inventoryCopyData(item), flags: item._source?.flags ?? {} }]);
    await item.delete();
    ui.notifications.info(`${target.name} recebeu "${item.name}".`);
    return true;
  }
  const sceneId = canvas?.scene?.id;
  if (!sceneId) {
    ui.notifications.warn("Abra uma cena com os dois personagens para passar o item.");
    return false;
  }
  return emit(SOCKET_EVENTS.ITEM_TRANSFER, { sceneId, fromActorId: holder.id, itemId: item.id, toActorId: target.id }, (name) => `${target.name} recebeu "${name}".`);
}

/** Leaves an item from a character's inventory on the map, next to that character. */
export function dropInventoryItemOnMap(item: any, point: { x: number; y: number }): Promise<boolean> {
  const sceneId = canvas?.scene?.id;
  if (!sceneId || !item.parent) return Promise.resolve(false);
  return emit(SOCKET_EVENTS.LOOT_DROP, { sceneId, actorId: item.parent.id, itemId: item.id, x: point.x, y: point.y }, (name) => `"${name}" ficou no chão.`);
}
