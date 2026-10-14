import type { PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import { fromUuidSync } from "../../documents/abstract/ClientDatabaseBackend";
import { currentGame, currentUi } from "../../runtime";

/** Token source for an actor centered on (x, y), snapped to the grid, from the actor's prototype token. */
export function actorTokenData(actor: any, x: number, y: number, canvas: any): PlainObject {
  const prototype = (actor._source.prototypeToken ?? {}) as PlainObject;
  const prototypeTexture = (prototype.texture ?? {}) as PlainObject;
  const playerOwned = actor.hasPlayerOwner === true;
  const gridSize = canvas.grid.size;
  const width = Number(prototype.width) || 1;
  const height = Number(prototype.height) || 1;
  const snapped = canvas.grid.getSnappedPoint({ x: x - (width * gridSize) / 2, y: y - (height * gridSize) / 2 }, { mode: "corner" });
  return {
    name: (prototype.name as string) || actor.name,
    actorId: actor.id,
    actorLink: prototype.actorLink ?? playerOwned,
    x: snapped.x,
    y: snapped.y,
    width,
    height,
    texture: { src: (prototypeTexture.src as string) || actor.img || CONST.DEFAULT_TOKEN },
    disposition: prototype.disposition ?? (playerOwned ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE),
    displayName: prototype.displayName ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    displayBars: prototype.displayBars ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    sight: { enabled: playerOwned, range: 0 },
  };
}

/** Turns supported drops into embedded documents: Actor -> Token, JournalEntry -> Note. */
export async function handleCanvasDrop(canvas: any, data: PlainObject): Promise<void> {
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
    await canvas.scene.createEmbeddedDocuments("Token", [actorTokenData(document, x, y, canvas)]);
    canvas.tokens?.activate();
    return;
  }
  if (document.documentName === "JournalEntry") {
    const point = canvas.grid.getSnappedPoint({ x, y }, { mode: "center" });
    await canvas.scene.createEmbeddedDocuments("Note", [{ entryId: document.id, x: point.x, y: point.y, text: "" }]);
  }
}
