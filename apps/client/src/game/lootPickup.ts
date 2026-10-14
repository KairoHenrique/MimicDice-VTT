import type { MenuEntry } from "@tabbletop/api";
import { LOOT_FLAG, SOCKET_EVENTS, type LootPickupRequest } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";

interface Point {
  x: number;
  y: number;
}

type PickupResponse = { ok: true; name: string } | { error: string };

function lootTilesAt(point: Point): any[] {
  return ((canvas.tiles?.placeables ?? []) as any[]).filter((tile) => {
    if (!tile.visible || !tile.document.flags?.core?.[LOOT_FLAG]) return false;
    const { x, y, width, height } = tile.bounds;
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  });
}

/** Tokens of characters this player owns on the scene, closest to the item first. */
function ownTokensNear(tile: any): any[] {
  const center = tile.center;
  const owned = ((canvas.tokens?.placeables ?? []) as any[]).filter((token) => token.document.actorId && token.actor?.isOwner);
  return owned.sort((left, right) => Math.hypot(left.center.x - center.x, left.center.y - center.y) - Math.hypot(right.center.x - center.x, right.center.y - center.y));
}

function requestPickup(socket: Socket, tile: any, token: any): void {
  const request: LootPickupRequest = { sceneId: canvas.scene.id, tileId: tile.id, actorId: token.document.actorId };
  socket.emit(SOCKET_EVENTS.LOOT_PICKUP, request, (response: PickupResponse) => {
    if ("error" in response) ui.notifications.warn(response.error);
    else ui.notifications.info(`${token.actor?.name ?? token.document.name} pegou "${response.name}".`);
  });
}

function pickupEntries(socket: Socket, point: Point): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const tile of lootTilesAt(point)) {
    const name = String(tile.document.flags.core[LOOT_FLAG].name ?? "item");
    const tokens = ownTokensNear(tile);
    if (tokens.length === 0) continue;
    const [closest] = tokens;
    entries.push({ label: `Pegar "${name}" (${closest.actor?.name ?? closest.document.name})`, icon: "fa-solid fa-hand-holding", onSelect: () => requestPickup(socket, tile, closest) });
  }
  return entries;
}

/** Players right-click an item the GM left on the map to put it in their character's inventory. */
export function registerLootPickup(socket: Socket): void {
  Hooks.on("canvasContextMenu", (point: Point, client: Point) => {
    if (game.user?.isGM || !canvas.ready || !canvas.scene) return;
    const entries = pickupEntries(socket, point);
    if (entries.length > 0) canvas.hud?.openMenuAt(entries, client);
  });
}
