import { h } from "../../views/dom";
import { playersSeeStatusPanel, statusResources, TABLE_RULES_CHANGED_HOOK } from "../../game/tableRules";
import { readStatusPanelState, STATUS_PANEL_STATE_HOOK, updateStatusPanelState } from "./statusPanelState";
import { actorsForPanel } from "./statusReadings";
import { buildActorCard, buildPicker } from "./statusPanelView";

const PANEL_ID = "status-panel";
const RENDER_DEBOUNCE_MS = 50;
const EDGE_MARGIN_PX = 8;
const REFRESH_HOOKS = [
  "createActor",
  "updateActor",
  "deleteActor",
  "createToken",
  "deleteToken",
  "createCombat",
  "updateCombat",
  "deleteCombat",
  "createCombatant",
  "deleteCombatant",
  "canvasReady",
  TABLE_RULES_CHANGED_HOOK,
  STATUS_PANEL_STATE_HOOK,
];

/** Floating, draggable panel with each character's life, effort and sanity bars, as the GM configured them. */
class StatusPanel {
  #element: HTMLElement | null = null;
  #pickerOpen = false;
  #filter = "";
  #queued = false;
  #renderAfterTyping = false;

  queueRender(): void {
    if (this.#queued) return;
    this.#queued = true;
    setTimeout(() => {
      this.#queued = false;
      this.render();
    }, RENDER_DEBOUNCE_MS);
  }

  /** Redrawing would throw away a number being typed, so updates wait until the field loses focus. */
  #isTyping(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && this.#element?.contains(active) === true && active.classList.contains("status-number");
  }

  render(): void {
    if (this.#isTyping()) {
      this.#renderAfterTyping = true;
      return;
    }
    this.#renderAfterTyping = false;
    const state = readStatusPanelState();
    const allowed = game.user.isGM || playersSeeStatusPanel();
    if (!allowed || !state.open) {
      this.#element?.remove();
      this.#element = null;
      return;
    }
    const scrollTop = this.#element?.querySelector(".status-list")?.scrollTop ?? 0;
    const panel = h("section", { id: PANEL_ID, class: `status-panel${state.collapsed ? " collapsed" : ""}`, "aria-label": "Painel de status", "data-help": "status-panel" }, this.#buildHeader(state.collapsed));
    if (!state.collapsed) {
      if (game.user.isGM && this.#pickerOpen) panel.append(buildPicker(state, this.#filter, (text) => (this.#filter = text)));
      panel.append(this.#buildList(state));
    }
    panel.addEventListener("focusout", () => {
      if (this.#renderAfterTyping) this.queueRender();
    });
    if (this.#element) this.#element.replaceWith(panel);
    else document.body.append(panel);
    this.#element = panel;
    this.#place(state.left, state.top);
    const list = panel.querySelector(".status-list");
    if (list) list.scrollTop = scrollTop;
  }

  #buildList(state: ReturnType<typeof readStatusPanelState>): HTMLElement {
    const resources = statusResources().filter((resource) => resource.enabled && (game.user.isGM || resource.playersSee));
    const actors = actorsForPanel(state);
    const list = h("ul", { class: "status-list" });
    if (resources.length === 0) list.append(h("li", { class: "status-empty hint" }, "O mestre desligou todas as barras."));
    else if (actors.length === 0) list.append(h("li", { class: "status-empty hint" }, game.user.isGM ? "Ninguém para mostrar. Use o filtro para escolher." : "Você ainda não controla nenhum personagem."));
    else for (const actor of actors) list.append(buildActorCard(actor, resources));
    return list;
  }

  #buildHeader(collapsed: boolean): HTMLElement {
    const header = h("header", { class: "status-panel-header", title: "Arraste para mover" }, h("i", { class: "fa-solid fa-heart-pulse", "aria-hidden": "true" }), h("strong", {}, "Status"));
    const tools = h("div", { class: "status-panel-tools" });
    if (game.user.isGM && !collapsed) {
      const picker = this.#toolButton(this.#pickerOpen ? "fa-solid fa-filter-circle-xmark" : "fa-solid fa-filter", "Escolher quem aparece", () => {
        this.#pickerOpen = !this.#pickerOpen;
        this.render();
      });
      picker.setAttribute("aria-expanded", String(this.#pickerOpen));
      tools.append(picker);
    }
    tools.append(
      this.#toolButton(collapsed ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-up", collapsed ? "Mostrar as barras" : "Recolher", () => void updateStatusPanelState({ collapsed: !collapsed })),
      this.#toolButton("fa-solid fa-xmark", "Fechar (reabra pelo botão Status na barra do topo)", () => void updateStatusPanelState({ open: false })),
    );
    header.append(tools);
    this.#enableDragging(header);
    return header;
  }

  #toolButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = h("button", { type: "button", class: "icon status-tool", title: label, "aria-label": label }, h("i", { class: icon, "aria-hidden": "true" }));
    button.addEventListener("click", onClick);
    return button;
  }

  #place(left: number, top: number): { left: number; top: number } {
    const panel = this.#element;
    if (!panel) return { left, top };
    const maxLeft = Math.max(EDGE_MARGIN_PX, window.innerWidth - panel.offsetWidth - EDGE_MARGIN_PX);
    const maxTop = Math.max(EDGE_MARGIN_PX, window.innerHeight - panel.offsetHeight - EDGE_MARGIN_PX);
    const placed = { left: Math.min(Math.max(EDGE_MARGIN_PX, left), maxLeft), top: Math.min(Math.max(EDGE_MARGIN_PX, top), maxTop) };
    panel.style.left = `${placed.left}px`;
    panel.style.top = `${placed.top}px`;
    return placed;
  }

  #enableDragging(header: HTMLElement): void {
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
      const panel = this.#element;
      if (!panel) return;
      event.preventDefault();
      const offset = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
      let placed = { left: panel.offsetLeft, top: panel.offsetTop };
      header.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        placed = this.#place(moveEvent.clientX - offset.x, moveEvent.clientY - offset.y);
      };
      const end = () => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", end);
        header.removeEventListener("pointercancel", end);
        void updateStatusPanelState(placed);
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", end);
      header.addEventListener("pointercancel", end);
    });
  }
}

export function installStatusPanel(): void {
  const panel = new StatusPanel();
  for (const hook of REFRESH_HOOKS) Hooks.on(hook, () => panel.queueRender());
  for (const hook of [STATUS_PANEL_STATE_HOOK, TABLE_RULES_CHANGED_HOOK]) Hooks.on(hook, () => void ui.hostToolbar?.render());
  Hooks.once("ready", () => panel.queueRender());
  window.addEventListener("resize", () => panel.queueRender());
}
