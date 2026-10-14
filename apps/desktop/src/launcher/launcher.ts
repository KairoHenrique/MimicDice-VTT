import { detectLanguage, t, translatePage } from "@tabbletop/i18n";
import type { DesktopBridge, LauncherState, RoomSummary, UpdateStatus } from "../ipcChannels";
import type { InviteAddress } from "../inviteAddresses";

declare global {
  interface Window {
    tabbletopDesktop: DesktopBridge;
  }
}

const bridge = window.tabbletopDesktop;
const COPIED_FEEDBACK_MS = 1500;
const STATUS_TEXT: Record<LauncherState["serverState"], string> = {
  starting: "Iniciando o servidor...",
  running: "Servidor ligado",
  failed: "O servidor não conseguiu iniciar",
};
const FIREWALL_TEXT = {
  missing: "Se seus amigos não conseguirem entrar, libere a porta no firewall. O Windows vai pedir permissão de administrador.",
  allowed: "Porta liberada no firewall. Seus amigos já podem entrar.",
} as const;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento ausente: ${id}`);
  return element as T;
}

const HIDDEN_INVITE_TEXT = "•".repeat(22);
/** Survives re-renders while the launcher is open; every new launch starts with the links hidden again. */
const revealedInviteUrls = new Set<string>();
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const EYE_PATHS = {
  open: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
  closed: ["M3 3l18 18", "M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1", "M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
} as const;

function eyeIcon(state: keyof typeof EYE_PATHS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const definition of EYE_PATHS[state]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", definition);
    svg.append(path);
  }
  return svg;
}

/** Links start hidden so a screenshot or a stream never leaks the host's address; copying works either way. */
function buildInviteItem(invite: InviteAddress): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `invite ${invite.kind}`;
  const label = document.createElement("span");
  label.className = "invite-label";
  label.textContent = invite.label;
  const url = document.createElement("span");
  url.className = "invite-url";

  const revealButton = document.createElement("button");
  revealButton.type = "button";
  revealButton.className = "icon-button";
  let revealed = revealedInviteUrls.has(invite.url);
  const applyVisibility = () => {
    url.textContent = revealed ? invite.url : HIDDEN_INVITE_TEXT;
    url.classList.toggle("hidden-link", !revealed);
    const action = revealed ? "Ocultar link" : "Mostrar link";
    revealButton.title = action;
    revealButton.setAttribute("aria-label", revealed ? `Ocultar link: ${invite.label}` : `Mostrar link: ${invite.label}`);
    revealButton.setAttribute("aria-pressed", String(revealed));
    revealButton.replaceChildren(eyeIcon(revealed ? "closed" : "open"));
  };
  revealButton.addEventListener("click", () => {
    revealed = !revealed;
    if (revealed) revealedInviteUrls.add(invite.url);
    else revealedInviteUrls.delete(invite.url);
    applyVisibility();
  });
  applyVisibility();

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copiar";
  copyButton.setAttribute("aria-label", `Copiar link: ${invite.label}`);
  copyButton.addEventListener("click", async () => {
    await bridge.copyText(invite.url);
    copyButton.textContent = "Copiado!";
    setTimeout(() => (copyButton.textContent = "Copiar"), COPIED_FEEDBACK_MS);
  });

  const actions = document.createElement("div");
  actions.className = "invite-actions";
  actions.append(revealButton, copyButton);
  item.append(label, url, actions);
  return item;
}

function renderStatus(state: LauncherState): void {
  byId("status-dot").className = `status-dot ${state.serverState}`;
  byId("status-text").textContent = STATUS_TEXT[state.serverState];
  const errorElement = byId("status-error");
  errorElement.hidden = !state.serverError;
  errorElement.textContent = state.serverError ?? "";
  byId<HTMLButtonElement>("open-table").disabled = state.serverState !== "running";
}

function renderInvites(state: LauncherState): void {
  const list = byId("invite-list");
  list.replaceChildren(...state.invites.map(buildInviteItem));
  byId("invite-empty").hidden = state.invites.length > 0;
}

function renderFirewall(firewall: LauncherState["firewall"]): void {
  const card = byId("firewall-card");
  card.hidden = firewall === "unsupported";
  if (firewall === "unsupported") return;
  byId("firewall-text").textContent = FIREWALL_TEXT[firewall];
  byId<HTMLButtonElement>("allow-firewall").hidden = firewall === "allowed";
}

let roomBusy = false;

function showRoomError(message: string | null): void {
  const errorElement = byId("room-error");
  errorElement.hidden = !message;
  errorElement.textContent = message ?? "";
}

async function runRoomAction(action: () => Promise<{ ok: boolean; error?: string }>): Promise<void> {
  if (roomBusy) return;
  roomBusy = true;
  showRoomError(null);
  try {
    const result = await action();
    if (!result.ok) showRoomError(result.error ?? "Não foi possível trocar de sala.");
  } finally {
    roomBusy = false;
    await renderRooms();
  }
}

function buildRoomItem(room: RoomSummary): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `room${room.active ? " active" : ""}`;
  const name = document.createElement("span");
  name.className = "room-name";
  name.translate = false;
  name.textContent = room.title;
  item.append(name);
  if (room.active) {
    const badge = document.createElement("span");
    badge.className = "room-active";
    badge.textContent = "Aberta";
    const enterButton = document.createElement("button");
    enterButton.type = "button";
    enterButton.className = "accent";
    enterButton.textContent = "Entrar";
    enterButton.setAttribute("aria-label", `Entrar na sala ${room.title}`);
    enterButton.addEventListener("click", () => void bridge.openTable());
    item.append(badge, enterButton);
    return item;
  }
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Abrir";
  openButton.addEventListener("click", () => {
    if (window.confirm(t(`Abrir a sala "${room.title}"? Quem estiver na mesa será recarregado.`))) void runRoomAction(() => bridge.openRoom(room.id));
  });
  item.append(openButton, buildDeleteButton(room));
  return item;
}

function buildDeleteButton(room: RoomSummary): HTMLButtonElement {
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "Excluir";
  deleteButton.setAttribute("aria-label", `Excluir a sala ${room.title}`);
  deleteButton.addEventListener("click", () => {
    const question = t(`Excluir a sala "${room.title}" para sempre?`);
    const consequence = t("Personagens, cenas, chat e jogadores dessa sala serão apagados e não dá para desfazer. A pasta de arquivos (mapas e imagens) continua em rpgs.");
    if (window.confirm(`${question}\n\n${consequence}`)) void runRoomAction(() => bridge.deleteRoom(room.id));
  });
  return deleteButton;
}

async function renderRooms(): Promise<void> {
  const result = await bridge.listRooms();
  const list = byId("room-list");
  if (!result.ok) {
    list.replaceChildren();
    return;
  }
  list.replaceChildren(...result.value.map(buildRoomItem));
}

function bindRoomActions(): void {
  const form = byId<HTMLFormElement>("room-create");
  const titleInput = byId<HTMLInputElement>("room-title");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    void runRoomAction(async () => {
      const result = await bridge.createRoom(title);
      if (result.ok) titleInput.value = "";
      return result;
    });
  });
}

const UPDATE_FOOTER_TEXT: Partial<Record<UpdateStatus["phase"], string>> = {
  checking: "Procurando atualização...",
  latest: "Você está na versão mais recente.",
  error: "Não foi possível procurar atualização.",
};

function updateCardText(update: UpdateStatus): string | null {
  const version = update.version ?? "nova";
  if (update.phase === "downloading") return t(`Baixando a versão ${version}: ${update.percent ?? 0}%`);
  if (update.phase === "ready") return t(`A versão ${version} está pronta. Clique para reiniciar e atualizar. A mesa fecha por alguns segundos e abre de novo sozinha.`);
  return null;
}

function renderUpdate(update: UpdateStatus): void {
  const cardText = updateCardText(update);
  byId("update-card").hidden = cardText === null;
  byId("update-text").textContent = cardText ?? "";
  const progress = byId<HTMLProgressElement>("update-progress");
  progress.hidden = update.phase !== "downloading";
  progress.value = update.percent ?? 0;
  byId("install-update").hidden = update.phase !== "ready";
  byId("update-footer").textContent = UPDATE_FOOTER_TEXT[update.phase] ?? "";
  const checkButton = byId<HTMLButtonElement>("check-update");
  checkButton.hidden = !["idle", "checking", "latest", "error"].includes(update.phase);
  checkButton.disabled = update.phase === "checking";
}

async function refresh(): Promise<void> {
  const state = await bridge.getLauncherState();
  renderStatus(state);
  renderInvites(state);
  renderFirewall(state.firewall);
  renderUpdate(state.update);
  byId("version").textContent = `v${state.version}`;
  const createButton = byId<HTMLFormElement>("room-create").querySelector<HTMLButtonElement>("button");
  if (createButton) createButton.disabled = state.serverState !== "running";
  if (state.serverState === "running") await renderRooms();
}

function bindActions(): void {
  bindRoomActions();
  byId("open-table").addEventListener("click", () => void bridge.openTable());
  byId("open-data").addEventListener("click", () => void bridge.openDataFolder());
  const firewallButton = byId<HTMLButtonElement>("allow-firewall");
  firewallButton.addEventListener("click", async () => {
    firewallButton.disabled = true;
    try {
      renderFirewall(await bridge.allowFirewall());
    } finally {
      firewallButton.disabled = false;
    }
  });
  bindUpdateActions();
  bridge.onStateChanged(() => void refresh());
}

function bindUpdateActions(): void {
  byId("check-update").addEventListener("click", () => void bridge.checkUpdate());
  const installButton = byId<HTMLButtonElement>("install-update");
  installButton.addEventListener("click", () => {
    installButton.disabled = true;
    installButton.textContent = t("Atualizando...");
    void bridge.installUpdate();
  });
}

/** The intro fades itself out; a click or Escape skips it, and it is removed so it never blocks the launcher. */
function playIntro(): void {
  const intro = byId("intro");
  const finish = () => {
    intro.classList.add("done");
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") finish();
  };
  intro.addEventListener("animationend", (event) => {
    if (event.target === intro) finish();
  });
  intro.addEventListener("click", finish);
  window.addEventListener("keydown", onKey);
}

void translatePage(detectLanguage(navigator.languages)).catch(() => undefined);
playIntro();
bindActions();
void refresh();
