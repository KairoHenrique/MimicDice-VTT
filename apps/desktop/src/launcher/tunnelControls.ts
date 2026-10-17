import { t } from "@tabbletop/i18n";
import type { DesktopBridge, ServerState, TunnelStatus } from "../ipcChannels";

interface GuideStep {
  title: string;
  text: string;
}

const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "O que é o link pela internet",
    text: "Ele gera um endereço https que seus amigos abrem no navegador, de qualquer lugar. Ninguém precisa instalar Radmin nem mexer no roteador.",
  },
  {
    title: "Ligue o interruptor",
    text: "Clique no interruptor ao lado de Link pela internet. Na primeira vez o app baixa o programa oficial da Cloudflare e confere a assinatura dele antes de usar. Isso leva alguns segundos.",
  },
  {
    title: "Copie e mande o link",
    text: "Quando ligar, aparece a linha Pela internet (Cloudflare) no topo da lista de convites. Clique em Copiar e mande o link para os jogadores.",
  },
  {
    title: "Os jogadores entram",
    text: "Eles abrem o link no navegador e entram com nome e senha, como sempre. Quem usa Radmin ou o mesmo Wi-Fi continua entrando pelos outros links, ao mesmo tempo, na mesma mesa.",
  },
  {
    title: "Cuidados",
    text: "O link muda cada vez que você liga o interruptor. Quem tiver o link chega na tela de entrada, então use senha no mestre e não poste o link em público. Desligue no fim da sessão; fechar o app também desliga.",
  },
];

const ACTIVE_PHASES = new Set<TunnelStatus["phase"]>(["downloading", "starting", "on"]);

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento ausente: ${id}`);
  return element as T;
}

function statusText(tunnel: TunnelStatus, serverState: ServerState): string {
  if (serverState !== "running" && tunnel.phase === "off") return t("Disponível quando o servidor estiver ligado.");
  switch (tunnel.phase) {
    case "downloading":
      return t(`Baixando o programa da Cloudflare (só na primeira vez): ${tunnel.percent ?? 0}%`);
    case "starting":
      return t("Ligando o link pela internet...");
    case "on":
      return t("Ligado. O link está no topo da lista abaixo.");
    case "error":
      return tunnel.error ?? t("Não foi possível ligar o link pela internet.");
    default:
      return t("Desligado. Ligue para gerar um link que funciona sem Radmin.");
  }
}

/** The light-switch control: on while downloading, starting or running; clicking again always turns it off. */
export function renderTunnel(tunnel: TunnelStatus, serverState: ServerState): void {
  const toggle = byId<HTMLButtonElement>("tunnel-switch");
  const active = ACTIVE_PHASES.has(tunnel.phase);
  toggle.setAttribute("aria-checked", String(active));
  toggle.classList.toggle("busy", tunnel.phase === "downloading" || tunnel.phase === "starting");
  toggle.disabled = serverState !== "running" && !active;
  const status = byId("tunnel-status");
  status.textContent = statusText(tunnel, serverState);
  status.classList.toggle("error", tunnel.phase === "error");
  const progress = byId<HTMLProgressElement>("tunnel-progress");
  progress.hidden = tunnel.phase !== "downloading";
  progress.value = tunnel.percent ?? 0;
}

function renderGuideStep(index: number): void {
  const step = GUIDE_STEPS[index] as GuideStep;
  byId("tunnel-guide-counter").textContent = t(`Passo ${index + 1} de ${GUIDE_STEPS.length}`);
  byId("tunnel-guide-title").textContent = t(step.title);
  byId("tunnel-guide-text").textContent = t(step.text);
  const dots = byId("tunnel-guide-dots");
  dots.replaceChildren(
    ...GUIDE_STEPS.map((_step, dotIndex) => {
      const dot = document.createElement("li");
      dot.classList.toggle("active", dotIndex === index);
      return dot;
    }),
  );
  byId<HTMLButtonElement>("tunnel-guide-back").disabled = index === 0;
  byId("tunnel-guide-next").textContent = t(index === GUIDE_STEPS.length - 1 ? "Entendi" : "Próximo");
}

function bindGuide(): void {
  const dialog = byId<HTMLDialogElement>("tunnel-guide");
  let index = 0;
  const show = (next: number) => {
    index = Math.max(0, Math.min(GUIDE_STEPS.length - 1, next));
    renderGuideStep(index);
  };
  byId("tunnel-help").addEventListener("click", () => {
    show(0);
    dialog.showModal();
  });
  byId("tunnel-guide-back").addEventListener("click", () => show(index - 1));
  byId("tunnel-guide-next").addEventListener("click", () => {
    if (index === GUIDE_STEPS.length - 1) dialog.close();
    else show(index + 1);
  });
  byId("tunnel-guide-close").addEventListener("click", () => dialog.close());
}

export function bindTunnelControls(bridge: DesktopBridge): void {
  const toggle = byId<HTMLButtonElement>("tunnel-switch");
  toggle.addEventListener("click", () => {
    const turnOn = toggle.getAttribute("aria-checked") !== "true";
    toggle.setAttribute("aria-checked", String(turnOn));
    void bridge.setTunnel(turnOn);
  });
  bindGuide();
}
