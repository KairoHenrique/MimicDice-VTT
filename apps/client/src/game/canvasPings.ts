import { canvasPingBroadcastSchema, MAX_PINGS_PER_WINDOW, PING_WINDOW_MS, SOCKET_EVENTS, type CanvasPingRequest } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { isScenePaused } from "./scenePause";
import { isTableSessionOpen } from "./tableSession";

interface PingAuthor {
  name?: string;
  color?: unknown;
}

const recentPingTimes: number[] = [];

/** Mirrors the server limit so the user gets told to wait instead of pings silently vanishing. */
function secondsUntilNextPing(): number {
  const now = Date.now();
  while (recentPingTimes.length > 0 && now - recentPingTimes[0]! >= PING_WINDOW_MS) recentPingTimes.shift();
  if (recentPingTimes.length < MAX_PINGS_PER_WINDOW) return 0;
  return Math.ceil((PING_WINDOW_MS - (now - recentPingTimes[0]!)) / 1000);
}

function playPing(point: { x: number; y: number }, author: PingAuthor | null | undefined): void {
  const color = typeof author?.color === "string" ? author.color : undefined;
  void canvas.ping(point, { color, label: author?.name });
}

/** The ping keybinding marks the point under the mouse; with Shift, a GM also brings everyone's camera there. */
export function registerPingKeybinding(socket: Socket): void {
  game.keybindings.register("core", "ping", {
    name: "Pingar no mapa",
    hint: "Destaca o ponto embaixo do mouse para todos. O mestre segurando Shift também leva a câmera de todos até lá.",
    editable: [{ key: "KeyP" }],
    onDown: (context: { repeat?: boolean; isShift?: boolean }) => {
      if (context.repeat || !canvas.ready || !canvas.scene) return false;
      if (!game.user.isGM && (isScenePaused() || !isTableSessionOpen())) return false;
      const waitSeconds = secondsUntilNextPing();
      if (waitSeconds > 0) {
        ui.notifications.warn(`Calma! São ${MAX_PINGS_PER_WINDOW} pings a cada ${PING_WINDOW_MS / 1000} segundos. Tente de novo em ${waitSeconds}s.`);
        return true;
      }
      recentPingTimes.push(Date.now());
      const { x, y } = canvas.mousePosition;
      const request: CanvasPingRequest = { sceneId: canvas.scene.id, x, y, pull: game.user.isGM && context.isShift === true };
      socket.emit(SOCKET_EVENTS.CANVAS_PING, request);
      playPing({ x, y }, game.user);
      if (request.pull) ui.notifications.info("Todos foram levados até o seu ping.");
      return true;
    },
  });
}

export function listenForPings(socket: Socket): void {
  socket.on(SOCKET_EVENTS.CANVAS_PING, (payload: unknown) => {
    const parsed = canvasPingBroadcastSchema.safeParse(payload);
    if (!parsed.success) return;
    const { sceneId, x, y, pull, userId } = parsed.data;
    const author = game.users.get(userId);
    if (canvas.scene?.id === sceneId) {
      if (pull) void canvas.animatePan({ x, y });
      playPing({ x, y }, author);
      return;
    }
    const scene = pull ? game.scenes.get(sceneId) : null;
    if (!scene) return;
    Hooks.once("canvasReady", () => {
      void canvas.animatePan({ x, y });
      playPing({ x, y }, author);
    });
    void scene.view();
  });
}
