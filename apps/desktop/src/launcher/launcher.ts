import type { DesktopBridge, LauncherState, RoomSummary } from "../ipcChannels";
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

function buildInviteItem(invite: InviteAddress): HTMLLIElement {
  const item = document.createElement("li");
  item.className = `invite ${invite.kind}`;
  const label = document.createElement("span");
  label.className = "invite-label";
  label.textContent = invite.label;
  const url = document.createElement("span");
  url.className = "invite-url";
  url.textContent = invite.url;
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copiar";
  copyButton.addEventListener("click", async () => {
    await bridge.copyText(invite.url);
    copyButton.textContent = "Copiado!";
    setTimeout(() => (copyButton.textContent = "Copiar"), COPIED_FEEDBACK_MS);
  });
  item.append(label, url, copyButton);
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
  name.textContent = room.title;
  item.append(name);
  if (room.active) {
    const badge = document.createElement("span");
    badge.className = "room-active";
    badge.textContent = "Aberta";
    item.append(badge);
    return item;
  }
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Abrir";
  openButton.addEventListener("click", () => {
    if (window.confirm(`Abrir a sala "${room.title}"? Quem estiver na mesa será recarregado.`)) void runRoomAction(() => bridge.openRoom(room.id));
  });
  item.append(openButton);
  return item;
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

async function refresh(): Promise<void> {
  const state = await bridge.getLauncherState();
  renderStatus(state);
  renderInvites(state);
  renderFirewall(state.firewall);
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
  bridge.onStateChanged(() => void refresh());
}

bindActions();
void refresh();
