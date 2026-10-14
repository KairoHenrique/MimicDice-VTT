import type { MenuEntry } from "@tabbletop/api";
import type { Socket } from "socket.io-client";
import { pullMenuEntries } from "./pullPlayers";
import { puppetBoardEntries } from "./puppetControl";

interface Point {
  x: number;
  y: number;
}

const ERASABLE_LAYERS = [
  { layer: "drawings", documentName: "Drawing", label: "desenho" },
  { layer: "templates", documentName: "MeasuredTemplate", label: "área de efeito" },
] as const;

function containsPoint(bounds: { x: number; y: number; width: number; height: number }, point: Point): boolean {
  const left = Math.min(bounds.x, bounds.x + bounds.width);
  const top = Math.min(bounds.y, bounds.y + bounds.height);
  return point.x >= left && point.x <= left + Math.abs(bounds.width) && point.y >= top && point.y <= top + Math.abs(bounds.height);
}

function authorName(object: any): string {
  return game.users.get(object.document._source?.author)?.name ?? "alguém";
}

function isPlayerMade(object: any): boolean {
  const author = game.users.get(object.document._source?.author);
  return Boolean(author) && !author.isGM;
}

/** Whatever the active layer, the GM can erase drawings and templates under the cursor, or every one a player made here. */
function eraseEntries(point: Point): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const playerMade: Array<{ documentName: string; id: string }> = [];
  for (const { layer, documentName, label } of ERASABLE_LAYERS) {
    for (const object of (canvas[layer]?.placeables ?? []) as any[]) {
      if (isPlayerMade(object)) playerMade.push({ documentName, id: object.id });
      if (containsPoint(object.bounds, point)) entries.push({ label: `Apagar ${label} de ${authorName(object)}`, icon: "fa-solid fa-eraser", onSelect: () => object.document.delete() });
    }
  }
  if (playerMade.length > 0) entries.push({ label: `Apagar tudo que os jogadores desenharam aqui (${playerMade.length})`, icon: "fa-solid fa-broom", onSelect: () => void eraseAllPlayerMade(playerMade) });
  return entries.length > 0 ? [{ heading: true, label: "Limpar o mapa", icon: "" }, ...entries] : [];
}

async function eraseAllPlayerMade(targets: Array<{ documentName: string; id: string }>): Promise<void> {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Limpar desenhos dos jogadores" },
    content: `<p>Apagar ${targets.length} desenho(s) e área(s) de efeito feitos pelos jogadores nesta cena? Isso não pode ser desfeito.</p>`,
    rejectClose: false,
  });
  if (confirmed !== true) return;
  for (const documentName of new Set(targets.map((target) => target.documentName))) {
    const ids = targets.filter((target) => target.documentName === documentName).map((target) => target.id);
    await canvas.scene.deleteEmbeddedDocuments(documentName, ids);
  }
  ui.notifications.info("Desenhos dos jogadores apagados.");
}

/** GM right click on the board (outside any object of the active layer): clean-up and pulling players. */
export function registerBoardContextMenu(socket: Socket): void {
  Hooks.on("canvasContextMenu", (point: Point, client: Point) => {
    if (!game.user?.isGM || !canvas.ready || !canvas.scene) return;
    canvas.hud?.openMenuAt([...puppetBoardEntries(), ...eraseEntries(point), ...pullMenuEntries(socket, point)], client);
  });
}
