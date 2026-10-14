import type { MenuEntry } from "@tabbletop/api";
import { CHEST_FLAG } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { draggedItem } from "../../ui/items/inventorySync";
import { addItemAsGameMaster, chestOf, chestTilesAt, chestTilesNear, connectChestActions, putInChest, saveChestAsGameMaster } from "./chestActions";
import { openChestWindow } from "./chestWindow";

interface Point {
  x: number;
  y: number;
}

function openEntry(tile: any): MenuEntry {
  return { label: `Abrir ${chestOf(tile)?.name ?? "baú"}`, icon: "fa-solid fa-box-open", onSelect: () => openChestWindow(tile) };
}

function gameMasterTileEntries(tile: any): MenuEntry[] {
  if (!chestOf(tile)) return [{ label: "Transformar em baú", icon: "fa-solid fa-box-archive", onSelect: () => saveChestAsGameMaster(tile, { name: "Baú", entries: [] }).then(() => openChestWindow(tile)) }];
  return [openEntry(tile), { label: "Deixar de ser baú (some com os itens)", icon: "fa-solid fa-box", onSelect: () => tile.document.update({ [`flags.core.-=${CHEST_FLAG}`]: null }) }];
}

/** Dropping an item on a chest stores it: the GM's go straight in, a player's own item goes through the server. */
function storeDroppedItem(data: Record<string, unknown>): boolean {
  const [tile] = chestTilesAt({ x: Number(data.x), y: Number(data.y) });
  if (!tile) return true;
  const item = draggedItem(JSON.stringify(data));
  if (!item) return true;
  if (game.user.isGM) void addItemAsGameMaster(tile, item);
  else if (item.parent?.isOwner) void putInChest(tile, item);
  else ui.notifications.warn("Só dá para guardar itens do seu inventário.");
  return false;
}

/** Chests are map objects holding items; players open them next to their character and see only what they noticed. */
export function registerChests(socket: Socket): void {
  connectChestActions(socket);
  Hooks.on("getTileMenuEntries", (tile: any, entries: MenuEntry[]) => {
    if (game.user.isGM) entries.unshift(...gameMasterTileEntries(tile));
  });
  Hooks.on("canvasContextMenu", (point: Point, client: Point) => {
    if (game.user.isGM || !canvas.ready) return;
    const entries = chestTilesAt(point).map(openEntry);
    if (entries.length > 0) canvas.hud?.openMenuAt(entries, client);
  });
  Hooks.on("getTokenMenuEntries", (token: any, entries: MenuEntry[]) => {
    if (game.user.isGM || !canvas.ready || !token.actor?.isOwner) return;
    entries.unshift(...chestTilesNear(token).map(openEntry));
  });
  Hooks.on("dropCanvasData", (_canvas: unknown, data: Record<string, unknown>) => storeDroppedItem(data));
}
