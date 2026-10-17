import { deepClone, type PlainObject } from "@tabbletop/common";
import { LOOT_FLAG } from "@tabbletop/protocol";
import { DialogV2 } from "../../applications/DialogV2";
import { CONST } from "../../constants";
import { fromUuidSync } from "../../documents/abstract/ClientDatabaseBackend";
import { currentConfig, currentGame, currentUi } from "../../runtime";
import { IMAGE_TILE_DROP_TYPE, placeImageTile } from "./imageTileDrop";

type ActorRoleKind = "player" | "enemy" | "npc";

/** Role flag first; older actors without one count as players when a player owns them. */
export function actorRoleOf(actor: any): ActorRoleKind {
  const stored = actor?.getFlag?.("world", "role") ?? actor?.flags?.world?.role;
  if (stored === "player" || stored === "enemy" || stored === "npc") return stored;
  return actor?.hasPlayerOwner === true ? "player" : "npc";
}

function topLeftForCenter(canvas: any, centerX: number, centerY: number, width: number, height: number): { x: number; y: number } {
  const gridSize = canvas.grid.size;
  return {
    x: Math.round(centerX - (width * gridSize) / 2),
    y: Math.round(centerY - (height * gridSize) / 2),
  };
}

/** Token source for an actor centered on (x, y), placed freely, from the actor's prototype token. */
export function actorTokenData(actor: any, x: number, y: number, canvas: any): PlainObject {
  const prototype = (actor._source.prototypeToken ?? {}) as PlainObject;
  const prototypeTexture = (prototype.texture ?? {}) as PlainObject;
  const role = actorRoleOf(actor);
  const playerOwned = role === "player" || actor.hasPlayerOwner === true;
  const gridSize = canvas.grid.size;
  const width = Number(prototype.width) || 1;
  const height = Number(prototype.height) || 1;
  const topLeft = topLeftForCenter(canvas, x, y, width, height);
  return {
    name: String(actor.name || prototype.name || "Token"),
    actorId: actor.id,
    actorLink: prototype.actorLink ?? playerOwned,
    x: topLeft.x,
    y: topLeft.y,
    width,
    height,
    /** Players start visible; enemies/NPCs stay hidden until the GM reveals them. */
    hidden: role !== "player",
    texture: { src: (prototypeTexture.src as string) || actor.img || CONST.DEFAULT_TOKEN },
    disposition: prototype.disposition ?? (playerOwned ? CONST.TOKEN_DISPOSITIONS.FRIENDLY : CONST.TOKEN_DISPOSITIONS.HOSTILE),
    displayName: prototype.displayName ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    displayBars: prototype.displayBars ?? CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    sight: { enabled: playerOwned, range: 0 },
  };
}

function tokensOfActorOnScene(scene: any, actorId: string): any[] {
  return scene.tokens.contents.filter((token: any) => token.actorId === actorId);
}

function tokensOfActorElsewhere(actorId: string, sceneId: string): any[] {
  const game = currentGame();
  const found: any[] = [];
  for (const scene of game?.scenes?.contents ?? []) {
    if (scene.id === sceneId) continue;
    for (const token of scene.tokens.contents) if (token.actorId === actorId) found.push(token);
  }
  return found;
}

async function focusPlacement(canvas: any, x: number, y: number): Promise<void> {
  await canvas.animatePan?.({ x, y });
  canvas.ping?.({ x, y });
}

async function moveTokenOnScene(token: any, x: number, y: number, canvas: any): Promise<void> {
  const width = Number(token.width) || 1;
  const height = Number(token.height) || 1;
  const corner = topLeftForCenter(canvas, x, y, width, height);
  await token.update(corner);
}

/** Brings a token from another scene here (copy + delete source), centered on (x, y). */
async function relocateTokenToScene(token: any, scene: any, x: number, y: number, canvas: any): Promise<void> {
  const { _id, ...source } = token.toObject();
  const width = Number(source.width) || 1;
  const height = Number(source.height) || 1;
  const corner = topLeftForCenter(canvas, x, y, width, height);
  await scene.createEmbeddedDocuments("Token", [{ ...source, ...corner }]);
  await token.delete();
}

async function deleteTokens(tokens: readonly any[]): Promise<void> {
  for (const token of tokens) await token.delete();
}

/** Moves the only token of this actor to (x, y), cleaning duplicates; creates one if none exists. */
async function teleportActorToken(actor: any, x: number, y: number, canvas: any): Promise<void> {
  const scene = canvas.scene;
  const onScene = tokensOfActorOnScene(scene, actor.id);
  if (onScene.length > 0) {
    const [primary, ...extras] = onScene;
    await moveTokenOnScene(primary, x, y, canvas);
    await deleteTokens(extras);
    await focusPlacement(canvas, x, y);
    return;
  }
  const elsewhere = tokensOfActorElsewhere(actor.id, scene.id);
  if (elsewhere.length > 0) {
    const [primary, ...extras] = elsewhere;
    await relocateTokenToScene(primary, scene, x, y, canvas);
    await deleteTokens(extras);
    await focusPlacement(canvas, x, y);
    return;
  }
  await scene.createEmbeddedDocuments("Token", [actorTokenData(actor, x, y, canvas)]);
  await focusPlacement(canvas, x, y);
}

function stripDocumentIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDocumentIds);
  if (value && typeof value === "object") {
    const out: PlainObject = {};
    for (const [key, nested] of Object.entries(value as PlainObject)) {
      if (key === "_id") continue;
      out[key] = stripDocumentIds(nested);
    }
    return out;
  }
  return value;
}

async function duplicateActorSheet(actor: any): Promise<any | null> {
  const ActorClass = currentConfig()?.Actor?.documentClass ?? actor.constructor;
  const data = stripDocumentIds(deepClone(actor.toObject())) as PlainObject;
  if (typeof data.name === "string" && data.name.trim()) data.name = `${data.name} (cópia)`;
  const created = await ActorClass.createDocuments([data]);
  return created?.[0] ?? null;
}

async function askEnemyPlacementChoice(actorName: string): Promise<"move" | "duplicate" | null> {
  const content = document.createElement("p");
  content.textContent = `"${actorName}" já tem token no mapa. Mover o existente para cá, ou duplicar a ficha e criar outro?`;
  const result = await DialogV2.wait({
    window: { title: "Token já existe" },
    content,
    buttons: [
      { action: "move", label: "Mover para cá", icon: "fa-solid fa-location-crosshairs", default: true, callback: () => "move" },
      { action: "duplicate", label: "Duplicar ficha", icon: "fa-solid fa-clone", callback: () => "duplicate" },
      { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null },
    ],
  });
  return result === "move" || result === "duplicate" ? result : null;
}

async function placeActorToken(actor: any, x: number, y: number, canvas: any): Promise<void> {
  const role = actorRoleOf(actor);
  if (role === "player") {
    await teleportActorToken(actor, x, y, canvas);
    return;
  }

  const scene = canvas.scene;
  const existingCount = tokensOfActorOnScene(scene, actor.id).length + tokensOfActorElsewhere(actor.id, scene.id).length;
  if (existingCount === 0) {
    await scene.createEmbeddedDocuments("Token", [actorTokenData(actor, x, y, canvas)]);
    canvas.tokens?.activate();
    return;
  }

  const choice = await askEnemyPlacementChoice(String(actor.name ?? "Ator"));
  if (choice === "move") {
    await teleportActorToken(actor, x, y, canvas);
    return;
  }
  if (choice === "duplicate") {
    const clone = await duplicateActorSheet(actor);
    if (!clone) {
      currentUi()?.notifications?.error("Não foi possível duplicar a ficha.");
      return;
    }
    await scene.createEmbeddedDocuments("Token", [actorTokenData(clone, x, y, canvas)]);
    currentUi()?.notifications?.info(`Ficha duplicada: ${clone.name}`);
  }
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
    await placeActorToken(document, x, y, canvas);
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
