import type { Socket } from "socket.io-client";

/** Away from the tab this long → reload on return so missed socket updates do not leave the board stale. */
const HIDDEN_RELOAD_MS = 12_000;

/**
 * Background tabs throttle timers and can drop or delay realtime updates. When the player comes back
 * after a while, or the socket reconnects after a drop, reload to pick up a fresh world snapshot.
 */
export function installTabSyncGuard(socket: Socket): void {
  let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
  let sawDisconnect = false;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (awayMs >= HIDDEN_RELOAD_MS || sawDisconnect) window.location.reload();
  });

  socket.on("disconnect", () => {
    sawDisconnect = true;
  });

  socket.io.on("reconnect", () => {
    window.location.reload();
  });
}
