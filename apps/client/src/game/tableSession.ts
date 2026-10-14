import type { ClientSettings } from "@tabbletop/api";
import { SOCKET_EVENTS, TABLE_ACTIVITY_REPORT_INTERVAL_MS, TABLE_SESSION_IDLE_CLOSE_MS, TABLE_SESSION_OPEN_SETTING_KEY } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { h } from "../views/dom";

const [SESSION_NAMESPACE, SESSION_KEY] = TABLE_SESSION_OPEN_SETTING_KEY.split(".") as [string, string];
const CLOSED_BODY_CLASS = "table-session-closed";
const OVERLAY_ID = "table-session-overlay";
const IDLE_MINUTES = Math.round(TABLE_SESSION_IDLE_CLOSE_MS / 60_000);
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel"] as const;

let frozenImageUrl: string | null = null;
let applyGeneration = 0;

export function registerTableSessionSetting(settings: ClientSettings): void {
  settings.register(SESSION_NAMESPACE, SESSION_KEY, {
    name: "Sessão em andamento",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: (open: unknown) => {
      void applyTableSession({ freezeLastView: true });
      if (game.user.isGM) return;
      if (open === true) ui.notifications.info("O mestre iniciou a sessão!");
      else ui.notifications.info("A sessão foi fechada. Você fica com a última visão do mapa até o mestre voltar.");
    },
  });
}

export function isTableSessionOpen(): boolean {
  return game.settings.get(SESSION_NAMESPACE, SESSION_KEY) === true;
}

export async function toggleTableSession(open: boolean = !isTableSessionOpen()): Promise<void> {
  if (!game.user.isGM) return;
  await game.settings.set(SESSION_NAMESPACE, SESSION_KEY, open);
  ui.notifications.info(open ? `Sessão iniciada. Ela fecha sozinha depois de ${IDLE_MINUTES} minutos sem ninguém mexer em nada.` : "Sessão fechada: os jogadores ficam congelados na última visão que tiveram.");
}

/** The board as this player sees it right now, as an image URL; null when there is no board to capture. */
async function captureBoard(): Promise<string | null> {
  const app = canvas?.app;
  if (!app || !canvas.ready) return null;
  try {
    app.renderer.render(app.stage);
    const view = app.view as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>((resolve) => view.toBlob(resolve, "image/png"));
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function releaseFrozenImage(): void {
  if (frozenImageUrl) URL.revokeObjectURL(frozenImageUrl);
  frozenImageUrl = null;
}

function closedNotice(withLastView: boolean): HTMLElement {
  const message = withLastView ? "Você está vendo a última imagem do mapa. Enquanto isso, pode abrir sua ficha e rolar dados." : "Aguarde o mestre iniciar a sessão. Enquanto isso, pode abrir sua ficha e rolar dados.";
  return h("div", { class: "pause-card" }, h("i", { class: "fa-solid fa-moon", "aria-hidden": "true" }), h("strong", {}, "Sessão fechada"), h("span", {}, message));
}

/** Players keep a still picture of their last view; if there is none (they just arrived), an opaque curtain. */
function buildPlayerOverlay(imageUrl: string | null): HTMLElement {
  if (!imageUrl) return h("div", { id: OVERLAY_ID, class: "pause-curtain", role: "alert", "aria-live": "assertive" }, closedNotice(false));
  const view = canvas.app.view as HTMLCanvasElement;
  const bounds = view.getBoundingClientRect();
  const image = h("img", { class: "session-freeze-image", src: imageUrl, alt: "Última visão do mapa antes de a sessão fechar" });
  Object.assign(image.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
  return h("div", { id: OVERLAY_ID, class: "session-freeze", role: "alert", "aria-live": "assertive" }, image, h("div", { class: "session-freeze-notice" }, closedNotice(true)));
}

function buildGameMasterBanner(): HTMLElement {
  return h("div", { id: OVERLAY_ID, class: "pause-banner session-banner", role: "status" }, h("i", { class: "fa-solid fa-moon", "aria-hidden": "true" }), h("span", {}, "Sessão fechada: os jogadores estão congelados"));
}

/** Mirrors the setting into the page; `freezeLastView` captures the board before anything else can change it. */
export async function applyTableSession({ freezeLastView = false }: { freezeLastView?: boolean } = {}): Promise<void> {
  const generation = ++applyGeneration;
  const open = isTableSessionOpen();
  const isGM = game.user.isGM;
  const wasClosed = document.body.classList.contains(CLOSED_BODY_CLASS);
  const capture = !isGM && !open && freezeLastView && !wasClosed ? await captureBoard() : null;
  if (generation !== applyGeneration) {
    if (capture) URL.revokeObjectURL(capture);
    return;
  }
  document.body.classList.toggle(CLOSED_BODY_CLASS, !open);
  void ui.hostToolbar?.render();
  if (!isGM && !open && wasClosed && document.getElementById(OVERLAY_ID)) return;
  document.getElementById(OVERLAY_ID)?.remove();
  releaseFrozenImage();
  if (open) return;
  if (isGM) {
    document.body.append(buildGameMasterBanner());
    return;
  }
  frozenImageUrl = capture;
  canvas?.hud?.cancelMoveConfirmation?.();
  canvas?.hud?.closeMenu?.();
  document.body.append(buildPlayerOverlay(capture));
}

/** Tells the server someone is at the table, at most once per interval, so an idle session can close on its own. */
function reportActivity(socket: Socket): void {
  let lastReportAt = 0;
  const onInput = () => {
    const now = Date.now();
    if (now - lastReportAt < TABLE_ACTIVITY_REPORT_INTERVAL_MS) return;
    lastReportAt = now;
    socket.emit(SOCKET_EVENTS.TABLE_ACTIVITY);
  };
  for (const eventName of ACTIVITY_EVENTS) window.addEventListener(eventName, onInput, { capture: true, passive: true });
}

export function installTableSession(socket: Socket): void {
  reportActivity(socket);
  Hooks.once("ready", () => void applyTableSession());
}
