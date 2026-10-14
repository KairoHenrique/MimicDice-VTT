import type { ClientSettings } from "@tabbletop/api";
import { SCENE_PAUSED_SETTING_KEY } from "@tabbletop/protocol";
import { h } from "../views/dom";

const [PAUSE_NAMESPACE, PAUSE_KEY] = SCENE_PAUSED_SETTING_KEY.split(".") as [string, string];
const PAUSED_BODY_CLASS = "scene-paused";
const CURTAIN_ID = "scene-pause-curtain";

export function registerScenePauseSetting(settings: ClientSettings): void {
  settings.register(PAUSE_NAMESPACE, PAUSE_KEY, {
    name: "Cena pausada",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: (paused: unknown) => {
      applyScenePause();
      if (!game.user.isGM) ui.notifications.info(paused ? "O mestre pausou a cena." : "A cena voltou!");
    },
  });
}

export function isScenePaused(): boolean {
  return game.settings.get(PAUSE_NAMESPACE, PAUSE_KEY) === true;
}

export async function toggleScenePause(pause: boolean = !isScenePaused()): Promise<void> {
  if (!game.user.isGM) return;
  await game.settings.set(PAUSE_NAMESPACE, PAUSE_KEY, pause);
  ui.notifications.info(pause ? "Cena pausada: os jogadores não veem nem mexem no mapa até você retomar." : "Cena retomada para os jogadores.");
}

/** Players get an opaque curtain over the board (sidebar, chat and sheets stay usable); the GM gets a reminder banner. */
function buildCurtain(): HTMLElement {
  if (game.user.isGM) {
    return h("div", { id: CURTAIN_ID, class: "pause-banner", role: "status" }, h("i", { class: "fa-solid fa-pause", "aria-hidden": "true" }), h("span", {}, "Cena pausada: os jogadores não veem suas mudanças"));
  }
  return h(
    "div",
    { id: CURTAIN_ID, class: "pause-curtain", role: "alert", "aria-live": "assertive" },
    h(
      "div",
      { class: "pause-card" },
      h("i", { class: "fa-solid fa-pause", "aria-hidden": "true" }),
      h("strong", {}, "Cena pausada"),
      h("span", {}, "O mestre está preparando algo. Enquanto isso, você pode rolar dados, conversar e ver sua ficha."),
    ),
  );
}

/** Mirrors the setting into the page and into `game.paused`, firing the `pauseGame` hook packages listen to. */
export function applyScenePause(): void {
  const paused = isScenePaused();
  document.body.classList.toggle(PAUSED_BODY_CLASS, paused);
  document.getElementById(CURTAIN_ID)?.remove();
  if (paused) document.body.append(buildCurtain());
  if (canvas?.interaction && !game.user.isGM && paused) canvas.hud?.cancelMoveConfirmation?.();
  if (game.paused !== paused) {
    game.paused = paused;
    Hooks.callAll("pauseGame", paused);
  }
  void ui.hostToolbar?.render();
}

/** `game.togglePause` (used by packages and macros) drives the shared scene pause when the GM calls it. */
export function installScenePause(): void {
  game.togglePause = (pause?: boolean) => void toggleScenePause(pause ?? !isScenePaused());
  Hooks.once("ready", () => applyScenePause());
}
