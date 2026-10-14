import { Game, installFoundryApi, loadPackageAssets, Notifications } from "@tabbletop/api";
import { PRODUCT_NAME, SOCKET_EVENTS, type WorldSnapshot } from "@tabbletop/protocol";
import { io, type Socket } from "socket.io-client";
import { HostToolbar } from "../ui/HostToolbar";
import { Players } from "../ui/Players";
import { SceneControls } from "../ui/canvas/SceneControls";
import { SceneNavigation } from "../ui/canvas/SceneNavigation";
import { CombatTracker } from "../ui/combat/CombatTracker";
import { announceOwnTurns } from "../ui/combat/turnNotice";
import { ChatLog } from "../ui/sidebar/ChatLog";
import { ActorCreationDialog } from "../ui/actors/ActorCreationDialog";
import { ActorDirectory } from "../ui/actors/ActorDirectory";
import { needsOwnCharacter } from "../ui/actors/ownCharacter";
import { CompendiumDirectory, DocumentDirectory, ItemDirectory, JournalDirectory, SceneDirectory } from "../ui/sidebar/DocumentDirectory";
import { Sidebar } from "../ui/sidebar/Sidebar";
import { registerCoreSettings, readPreferredLanguage } from "./coreSettings";
import { registerCoreSheets } from "./coreSheets";
import { listenForPings, registerPingKeybinding } from "./canvasPings";
import { registerLiveTokenDrag } from "./liveTokenDrag";
import { registerBoardContextMenu } from "./boardContextMenu";
import { registerContextHelp } from "../ui/help/contextHelp";
import { installScenePause } from "./scenePause";
import { installTableSession } from "./tableSession";
import { registerPuppetControl } from "./puppetControl";
import { installTokenDragRule } from "./tableRules";
import { installCombatTurnBanner } from "../ui/combat/combatTurnBanner";
import { trackTurnMovement } from "../ui/combat/turnMovement";
import { installStatusPanel } from "../ui/status/StatusPanel";
import { controlOwnTokenOnSceneLoad, listenForPullToScene, registerTableKeybindings, syncClientPreferences, syncLightAreasOnSceneLoad } from "./tableControls";

const SNAPSHOT_TIMEOUT_MS = 15_000;

function connectSocket(): Promise<Socket> {
  const socket = io({ transports: ["websocket"], withCredentials: true, reconnection: true });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (error) => {
      socket.close();
      reject(error);
    });
  });
}

async function requestWorldSnapshot(socket: Socket): Promise<WorldSnapshot> {
  const response = (await socket.timeout(SNAPSHOT_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.WORLD)) as WorldSnapshot | { error: string };
  if ("error" in response) throw new Error(response.error);
  return response;
}

function prepareGameLayout(root: HTMLElement): void {
  document.body.classList.add("game", "vtt");
  root.replaceChildren();
  const board = document.createElement("div");
  board.id = "board";
  root.append(board);
}

/** Exposes core sidebar classes under their v13 namespace so packages can subclass or wrap them at load time. */
function registerSidebarClasses(): void {
  const sidebarNamespace = foundry.applications.sidebar;
  sidebarNamespace.Sidebar = Sidebar;
  sidebarNamespace.DocumentDirectory = DocumentDirectory;
  Object.assign(sidebarNamespace.tabs, { ChatLog, CombatTracker, ActorDirectory, ItemDirectory, JournalDirectory, SceneDirectory, CompendiumDirectory });
}

async function renderInterface(): Promise<void> {
  const players = new Players();
  const sidebar = new Sidebar();
  ui.players = players;
  ui.sidebar = sidebar;
  ui.hostToolbar = new HostToolbar();
  ui.controls = new SceneControls();
  ui.nav = new SceneNavigation();
  await Promise.all([
    players.render({ force: true }),
    ui.hostToolbar.render({ force: true }),
    sidebar.render({ force: true }),
    ui.controls.render({ force: true }),
  ]);
  await sidebar.renderDirectories();
  Hooks.on("userConnected", () => void players.render());
  const refreshToolbar = () => void ui.hostToolbar.render();
  for (const hook of ["createActor", "deleteActor", "updateActor", "updateUser"]) Hooks.on(hook, refreshToolbar);
  if (needsOwnCharacter(game.user)) void ActorCreationDialog.openWelcome();
}

export async function bootGame(root: HTMLElement): Promise<void> {
  const notifications = new Notifications();
  notifications.attach(document.getElementById("notifications") as HTMLElement);
  installFoundryApi(notifications);
  registerSidebarClasses();

  let socket: Socket;
  try {
    socket = await connectSocket();
  } catch {
    window.location.reload();
    return;
  }
  socket.on(SOCKET_EVENTS.WORLD_RELOADED, () => window.location.reload());
  const snapshot = await requestWorldSnapshot(socket);
  prepareGameLayout(root);

  const game = new Game(snapshot, socket, { registerCoreSettings, renderInterface, onSessionEnded: () => window.location.reload() }, readPreferredLanguage());
  Object.defineProperty(globalThis, "game", { value: game, writable: true, configurable: true });
  document.title = `${snapshot.world.title} • ${PRODUCT_NAME}`;

  registerCoreSheets();
  const activePackages = [snapshot.system, ...snapshot.modules.filter((module) => module.active)].filter((record) => record !== null);
  await loadPackageAssets(activePackages);
  registerTableKeybindings();
  registerPingKeybinding(socket);
  listenForPullToScene(socket);
  registerBoardContextMenu(socket);
  registerContextHelp();
  registerLiveTokenDrag(socket);
  syncLightAreasOnSceneLoad();
  listenForPings(socket);
  announceOwnTurns();
  installScenePause();
  installTableSession(socket);
  registerPuppetControl();
  installTokenDragRule();
  trackTurnMovement();
  installCombatTurnBanner();
  installStatusPanel();
  controlOwnTokenOnSceneLoad();
  syncClientPreferences();
  game.keybindings.activateListeners();
  await game.initialize();
}
