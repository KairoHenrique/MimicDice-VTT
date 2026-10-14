import type { ClientSettings } from "@tabbletop/api";
import { MAP_LOCKED_SETTING_KEY, SOCKET_EVENTS } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { findOwnCharacter } from "../ui/actors/ownCharacter";

const [MAP_LOCK_NAMESPACE, MAP_LOCK_KEY] = MAP_LOCKED_SETTING_KEY.split(".") as [string, string];
const PULL_TIMEOUT_MS = 5_000;

export function registerTableSettings(settings: ClientSettings): void {
  settings.register(MAP_LOCK_NAMESPACE, MAP_LOCK_KEY, {
    name: "Mapa travado",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: (locked: unknown) => {
      void ui.hostToolbar?.render();
      void ui.controls?.render();
      if (!game.user.isGM) ui.notifications.info(locked ? "O mestre travou o mapa." : "O mestre liberou o mapa.");
    },
  });
}

export function isMapLocked(): boolean {
  return game.settings.get(MAP_LOCK_NAMESPACE, MAP_LOCK_KEY) === true;
}

export async function toggleMapLock(): Promise<void> {
  const locked = !isMapLocked();
  await game.settings.set(MAP_LOCK_NAMESPACE, MAP_LOCK_KEY, locked);
  ui.notifications.info(locked ? "Mapa travado: os jogadores não mexem em nada até você liberar." : "Mapa liberado para os jogadores.");
}

/** Moves every connected player to the scene the GM is looking at. */
export async function pullPlayersToViewedScene(socket: Socket): Promise<void> {
  const scene = canvas.scene;
  if (!scene) {
    ui.notifications.warn("Abra uma cena primeiro.");
    return;
  }
  const response = (await socket.timeout(PULL_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.PULL_TO_SCENE, { sceneId: scene.id }).catch(() => ({ error: "Sem resposta do servidor" }))) as { error?: string };
  if (response.error) ui.notifications.error(response.error);
  else ui.notifications.info(`Jogadores puxados para "${scene.name}".`);
}

export function listenForPullToScene(socket: Socket): void {
  socket.on(SOCKET_EVENTS.PULL_TO_SCENE, (payload: unknown) => {
    const sceneId = typeof payload === "object" && payload !== null ? (payload as { sceneId?: unknown }).sceneId : undefined;
    const scene = typeof sceneId === "string" ? game.scenes.get(sceneId) : undefined;
    if (!scene || canvas.scene?.id === scene.id) return;
    ui.notifications.info(`O mestre levou você para "${scene.name}".`);
    void scene.view();
  });
}

/** The token a user plays on the viewed scene: controlled first, then their character's, then any they own. */
function ownTokenOnCanvas(): any | null {
  const tokens: any[] = canvas.tokens?.placeables ?? [];
  const controlled = canvas.tokens?.controlled?.[0];
  if (controlled) return controlled;
  const characterId = findOwnCharacter(game.user)?.id;
  return tokens.find((token) => characterId && token.document.actorId === characterId) ?? tokens.find((token) => token.isOwner && !game.user.isGM) ?? null;
}

function isInteractiveElement(element: Element | null): boolean {
  return element instanceof HTMLButtonElement || element instanceof HTMLSelectElement || element instanceof HTMLAnchorElement;
}

export function registerTableKeybindings(): void {
  game.keybindings.register("core", "centerOwnToken", {
    name: "Centralizar no meu token",
    editable: [{ key: "Space" }],
    onDown: () => {
      if (isInteractiveElement(document.activeElement) || !canvas.ready) return false;
      const token = ownTokenOnCanvas();
      if (!token) return false;
      void canvas.animatePan({ x: token.center.x, y: token.center.y });
      return true;
    },
  });
}

/** When a player's scene loads, their character's token is already selected, ready to move. */
export function controlOwnTokenOnSceneLoad(): void {
  Hooks.on("canvasReady", () => {
    if (game.user.isGM) return;
    const characterId = findOwnCharacter(game.user)?.id;
    const token = (canvas.tokens?.placeables ?? []).find((candidate: any) => characterId && candidate.document.actorId === characterId && candidate.isOwner);
    if (!token) return;
    token.control({ releaseOthers: true });
    void canvas.animatePan({ x: token.center.x, y: token.center.y });
  });
}
