import type { PlainObject } from "@tabbletop/common";
import { LOOT_FLAG } from "@tabbletop/protocol";
import { CONST } from "../../constants";
import { fromUuidSync } from "../../documents/abstract/ClientDatabaseBackend";
import { currentGame, currentUi } from "../../runtime";
import { IMAGE_TILE_DROP_TYPE, placeImageTile } from "./imageTileDrop";

/** Token source for an actor centered on (x, y) (snapped to the grid when asked), from the actor's prototype token. */
export function actorTokenData(actor: any, x: number, y: number, canvas: any, snap = true): PlainObject {
  const prototype = (actor._source.prototypeToken ?? {}) as PlainObject;
  const prototypeTexture = (prototype.texture ?? {}) as PlainObject;
  const playerOwned = actor.hasPlayerOwner === true;
  const gridSize = canvas.grid.size;
  const width = Number(prototype.width) || 1;
  const height = Number(prototype.height) || 1;
  const topLeft = { x: x - (width * gridSize) / 2, y: y - (height * gridSize) / 2 };
  const placed = snap ? canvas.grid.getSnappedPoint(topLeft, { mode: "corner" }) : topLeft;
  return {
    name: (prototype.name as string) || actor.name,
    actorId: actor.id,
    actorLink: prototype.actorLink ?? playerOwned,
    x: Math.round(placed.x),
    y: Math.round(placed.y),
    width,
    height,
    texture: { src: (prototypeTexture.src as string) || actor.img || CONST.DEFAULT_TOKEN },
    disposition: prototype.disposition ?? (playerOwned ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE),
    displayName: prototype.displayName ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    displayBars: prototype.displayBars ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    sight: { enabled: playerOwned, range: 0 },
  };
}

/** The GM leaves an item on the map as a one-square tile; a player next to it can pick it up into a character's inventory. */
async function dropLoot(canvas: any, item: any, x: number, y: number): Promise<void> {
  if (!currentGame()?.user?.isGM) {
    currentUi()?.notifications?.warn("Só o mestre coloca itens no mapa.");
    return;
  }
  const source = item._source ?? {};
  const loot = { name: item.name, type: item.type, img: source.img ?? null, system: source.system ?? {}, flags: { core: { sourceId: item.uuid } } };
  const size = canvas.grid.size;
  const corner = canvas.grid.getSnappedPoint({ x: x - size / 2, y: y - size / 2 }, { mode: "corner" });
  await canvas.scene.createEmbeddedDocuments("Tile", [
    { x: corner.x, y: corner.y, width: size, height: size, texture: { src: source.img || "icons/svg/item-bag.svg" }, flags: { core: { [LOOT_FLAG]: loot } } },
  ]);
  currentUi()?.notifications?.info(`"${item.name}" está no mapa. Um jogador perto dele pode pegar com o botão direito.`);
}

/** Turns supported drops into embedded documents: Actor -> Token, Item -> loot tile, JournalEntry -> Note. */
export async function handleCanvasDrop(canvas: any, data: PlainObject): Promise<void> {
  if (data.type === IMAGE_TILE_DROP_TYPE && data.texture && typeof data.texture === "object") {
    const point = { x: Number(data.x), y: Number(data.y) };
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
      await placeImageTile(canvas, (data.texture as PlainObject).src, point, { pixelsPerSquare: Number(data.pixelsPerSquare) || undefined, free: data.free === true });
    }
    return;
  }
  const document = typeof data.uuid === "string" ? fromUuidSync(data.uuid) : null;
  const x = Number(data.x);
  const y = Number(data.y);
  if (!document || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const user = currentGame()?.user;
  if (document.documentName === "Actor") {
    if (!user?.isGM && !document.testUserPermission(user, "OWNER")) {
      currentUi()?.notifications?.warn("Você só pode colocar no mapa personagens que são seus.");
      return;
    }
    await canvas.scene.createEmbeddedDocuments("Token", [actorTokenData(document, x, y, canvas, data.free === true)]);
    canvas.tokens?.activate();
    return;
  }
  if (document.documentName === "Item") {
    await dropLoot(canvas, document, x, y);
    return;
  }
  if (document.documentName === "JournalEntry") {
    const point = canvas.grid.getSnappedPoint({ x, y }, { mode: "center" });
    await canvas.scene.createEmbeddedDocuments("Note", [{ entryId: document.id, x: point.x, y: point.y, text: "" }]);
  }
}
