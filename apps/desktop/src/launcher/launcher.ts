import type { DesktopBridge, LauncherState } from "../ipcChannels";
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

async function refresh(): Promise<void> {
  const state = await bridge.getLauncherState();
  renderStatus(state);
  renderInvites(state);
  renderFirewall(state.firewall);
  byId("version").textContent = `v${state.version}`;
}

function bindActions(): void {
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
