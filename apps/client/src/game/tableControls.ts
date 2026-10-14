import type { ClientSettings, KeybindingOverrides, MovePathMode } from "@tabbletop/api";
import { MAP_LOCKED_SETTING_KEY, pullToSceneRequestSchema, SOCKET_EVENTS } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { findOwnCharacter } from "../ui/actors/ownCharacter";

const [MAP_LOCK_NAMESPACE, MAP_LOCK_KEY] = MAP_LOCKED_SETTING_KEY.split(".") as [string, string];
const PULL_TIMEOUT_MS = 5_000;
const GM_EDIT_MODE_KEY = "gmEditMode";
const MOVE_PATH_MODE_KEY = "movePathMode";
const KEYBINDINGS_KEY = "keybindings";
const TOOLBAR_COLLAPSED_KEY = "hostToolbarCollapsed";
const MOVE_PATH_MODES = new Set<MovePathMode>(["modifier", "always", "never"]);
const EDIT_ONLY_CONTROLS = new Set(["tiles", "walls", "lighting"]);

export function registerTableSettings(settings: ClientSettings): void {
  settings.register("core", GM_EDIT_MODE_KEY, {
    name: "Modo edição do mestre",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => void applyGmMode(),
  });
  settings.register("core", MOVE_PATH_MODE_KEY, {
    name: "Caminho e confirmação do movimento",
    hint: "Mostra o caminho e a distância e só move o token depois de confirmar. A tecla do caminho pode ser trocada na aba Atalhos.",
    scope: "client",
    config: true,
    type: String,
    default: "modifier",
    choices: { modifier: "Só segurando a tecla do caminho (Ctrl)", always: "Sempre", never: "Nunca" },
    onChange: (mode: unknown) => applyMovePathMode(mode),
  });
  settings.register("core", KEYBINDINGS_KEY, { name: "Atalhos personalizados", scope: "user", config: false, type: Object, default: {} });
  settings.register("core", TOOLBAR_COLLAPSED_KEY, {
    name: "Barra do topo recolhida",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => void ui.hostToolbar?.render(),
  });
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

export function isToolbarCollapsed(): boolean {
  return game.settings.get("core", TOOLBAR_COLLAPSED_KEY) === true;
}

export async function toggleToolbarCollapsed(): Promise<void> {
  await game.settings.set("core", TOOLBAR_COLLAPSED_KEY, !isToolbarCollapsed());
}

export function isMapLocked(): boolean {
  return game.settings.get(MAP_LOCK_NAMESPACE, MAP_LOCK_KEY) === true;
}

export async function toggleMapLock(): Promise<void> {
  const locked = !isMapLocked();
  await game.settings.set(MAP_LOCK_NAMESPACE, MAP_LOCK_KEY, locked);
  ui.notifications.info(locked ? "Mapa travado: os jogadores não mexem em nada até você liberar." : "Mapa liberado para os jogadores.");
}

/** Edit mode unlocks walls, lights and tiles for the GM; play mode keeps only what is used during a session. */
export function isGmEditMode(): boolean {
  return game.user?.isGM === true && game.settings.get("core", GM_EDIT_MODE_KEY) === true;
}

export function isEditOnlyControl(controlName: string): boolean {
  return EDIT_ONLY_CONTROLS.has(controlName);
}

export async function toggleGmEditMode(): Promise<void> {
  const editing = !isGmEditMode();
  await game.settings.set("core", GM_EDIT_MODE_KEY, editing);
  ui.notifications.info(editing ? "Modo edição: paredes, luzes e tiles liberados." : "Modo jogo: só tokens e o que se usa na partida.");
}

async function applyGmMode(): Promise<void> {
  void ui.hostToolbar?.render();
  if (!isGmEditMode() && isEditOnlyControl(ui.controls?.activeControl ?? "")) await ui.controls?.activate({ control: "tokens" });
  else await ui.controls?.render();
}

function applyMovePathMode(mode: unknown): void {
  if (!canvas?.interaction) return;
  canvas.interaction.movePathMode = MOVE_PATH_MODES.has(mode as MovePathMode) ? (mode as MovePathMode) : "modifier";
}

/** Copies the client preferences (path mode, custom key bindings) into the running game once settings are readable. */
export function syncClientPreferences(): void {
  Hooks.once("ready", () => {
    applyMovePathMode(game.settings.get("core", MOVE_PATH_MODE_KEY));
    game.keybindings.loadOverrides(game.settings.get("core", KEYBINDINGS_KEY));
    game.keybindings.persist = (overrides: KeybindingOverrides) => game.settings.set("core", KEYBINDINGS_KEY, overrides);
  });
}

/** Moves every connected player to the scene the GM is looking at; with `shareView`, also to the GM's camera and zoom. */
export async function pullPlayersToViewedScene(socket: Socket, shareView = false): Promise<void> {
  const scene = canvas.scene;
  if (!scene || !canvas.ready) {
    ui.notifications.warn("Abra uma cena primeiro.");
    return;
  }
  const stage = canvas.stage;
  const view = shareView ? { x: stage.pivot.x, y: stage.pivot.y, scale: stage.scale.x } : undefined;
  const response = (await socket.timeout(PULL_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.PULL_TO_SCENE, { sceneId: scene.id, view }).catch(() => ({ error: "Sem resposta do servidor" }))) as { error?: string };
  if (response.error) ui.notifications.error(response.error);
  else ui.notifications.info(shareView ? "Todos estão vendo exatamente o que você vê." : `Jogadores puxados para "${scene.name}".`);
}

export function listenForPullToScene(socket: Socket): void {
  socket.on(SOCKET_EVENTS.PULL_TO_SCENE, (payload: unknown) => {
    const parsed = pullToSceneRequestSchema.safeParse({ ...(payload as object), view: (payload as { view?: unknown } | null)?.view ?? undefined });
    if (!parsed.success) return;
    const scene = game.scenes.get(parsed.data.sceneId);
    if (!scene) return;
    const view = parsed.data.view;
    if (canvas.scene?.id === scene.id) {
      if (view) void canvas.animatePan(view);
      return;
    }
    ui.notifications.info(`O mestre levou você para "${scene.name}".`);
    if (view) Hooks.once("canvasReady", () => void canvas.animatePan(view));
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
  game.keybindings.register("core", "movePathKey", {
    name: "Tecla do caminho",
    hint: "Segure enquanto arrasta um token para ver o caminho e confirmar antes de andar.",
    editable: [{ key: "ControlLeft" }, { key: "ControlRight" }],
    onDown: () => setPathKeyHeld(true),
    onUp: () => setPathKeyHeld(false),
  });
}

function setPathKeyHeld(held: boolean): false {
  if (canvas?.interaction) canvas.interaction.pathModifierHeld = held;
  return false;
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
