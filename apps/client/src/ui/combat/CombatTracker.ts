import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { SIDEBAR_CONTENT_ID } from "../sidebar/DocumentDirectory";
import { addTokensToCombat, confirmEndCombat, viewedCombat } from "./combatActions";
import { playersSeeTurnMovement, TABLE_RULES_CHANGED_HOOK } from "../../game/tableRules";
import { buildCombatantRow } from "./combatantRow";
import { enableTurnOrderDragging } from "./turnOrderDragging";
import { currentTurnMovementLabel } from "./turnMovement";

const RENDER_DEBOUNCE_MS = 30;
const REFRESH_HOOKS = ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "canvasReady", TABLE_RULES_CHANGED_HOOK];

function actionButton(icon: string, label: string, onClick: () => unknown, { primary = false, iconOnly = false, shortLabel = label } = {}): HTMLButtonElement {
  const button = h("button", { type: "button", class: `${primary ? "primary" : ""}${iconOnly ? " icon" : ""}`.trim(), title: label, "aria-label": label }, h("i", { class: icon }), iconOnly ? null : ` ${shortLabel}`);
  button.addEventListener("click", () => void onClick());
  return button;
}

/** Sidebar tab with the turn order (`ui.combat`): everyone sees it, the GM sets each initiative and runs the rounds. */
export class CombatTracker extends DomApplication {
  static tabName = "combat";
  static tabLabel = "Combate";
  static tabIcon = "fa-solid fa-list-ol";

  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "combat",
    classes: ["combat-sidebar", "sidebar-tab", "tab", "directory"],
    tag: "section",
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  #renderQueued = false;

  constructor() {
    super();
    for (const hook of REFRESH_HOOKS) Hooks.on(hook, () => this.#queueRender());
  }

  get tabName(): string {
    return CombatTracker.tabName;
  }

  get viewed(): any | null {
    return viewedCombat();
  }

  override _insertElement(element: HTMLElement): void {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (document.getElementById(SIDEBAR_CONTENT_ID) ?? document.body).append(element);
  }

  /** Many embedded updates arrive together (e.g. "rolar todos"); one render per burst is enough. A timer, not rAF, so background tabs stay current. */
  #queueRender(): void {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    setTimeout(() => {
      this.#renderQueued = false;
      void this.render();
    }, RENDER_DEBOUNCE_MS);
  }

  buildContent(): Node[] {
    const combat = this.viewed;
    if (!combat) return this.#buildEmptyState();
    const turns: any[] = combat.turns.filter((combatant: any) => combatant.visible);
    const current = combat.started ? combat.combatant : null;
    const list = h("ol", { class: "combat-turns", "aria-label": "Ordem dos turnos" }, ...turns.map((combatant) => buildCombatantRow(combatant, combatant === current)));
    if (turns.length === 0) list.append(h("li", { class: "directory-empty hint" }, game.user.isGM ? "Selecione tokens no mapa e clique em Adicionar." : "Ninguém no combate ainda."));
    if (game.user.isGM) enableTurnOrderDragging(list, combat);
    return [this.#buildHeader(combat), ...(game.user.isGM ? this.#buildGameMasterTools(combat) : []), list, this.#buildFooter(combat)];
  }

  #buildEmptyState(): Node[] {
    if (!game.user.isGM) return [h("p", { class: "combat-empty hint" }, "Nenhum combate em andamento.")];
    const start = actionButton("fa-solid fa-plus", "Criar combate com os selecionados", () => addTokensToCombat(), { primary: true });
    return [h("header", { class: "directory-header" }, start), h("p", { class: "combat-empty hint" }, "Selecione os tokens no mapa (Shift + clique para vários) e crie o combate. Depois digite a iniciativa de cada um e clique em Iniciar.")];
  }

  #buildHeader(combat: any): HTMLElement {
    const status = combat.started ? `Turno ${combat.round}` : "Aguardando início";
    const current = combat.started && combat.combatant?.visible ? combat.combatant : null;
    const turnPosition = current ? this.#turnPosition(combat, current) : null;
    const movement = current && (game.user.isGM || playersSeeTurnMovement()) ? currentTurnMovementLabel(combat) : null;
    return h(
      "header",
      { class: "combat-header", "aria-live": "polite" },
      h("div", { class: "combat-header-line" }, h("strong", { class: "combat-round" }, status), turnPosition ? h("span", { class: "combat-turn-position" }, turnPosition) : null),
      current ? h("span", { class: "combat-current" }, h("i", { class: "fa-solid fa-play", "aria-hidden": "true" }), ` Vez de ${current.name || "Sem nome"}`) : null,
      movement ? h("span", { class: "combat-moved", title: "Quanto o personagem da vez já andou neste turno" }, h("i", { class: "fa-solid fa-shoe-prints", "aria-hidden": "true" }), " ", h("span", {}, "Andou"), " ", h("span", {}, movement)) : null,
    );
  }

  #turnPosition(combat: any, current: any): string | null {
    const turns: any[] = combat.turns.filter((combatant: any) => combatant.visible);
    const index = turns.indexOf(current);
    return index >= 0 ? `Vez ${index + 1} de ${turns.length}` : null;
  }

  #buildGameMasterTools(combat: any): Node[] {
    const tools = h(
      "div",
      { class: "combat-tools", role: "toolbar", "aria-label": "Ferramentas do mestre" },
      actionButton("fa-solid fa-user-plus", "Adicionar os tokens selecionados", () => addTokensToCombat(), { shortLabel: "Adicionar" }),
      actionButton("fa-solid fa-rotate-left", "Limpar todas as iniciativas", () => combat.resetAll(), { shortLabel: "Zerar" }),
      actionButton("fa-solid fa-flag-checkered", "Encerrar combate", () => confirmEndCombat(combat), { shortLabel: "Encerrar" }),
    );
    if (!combat.hasManualOrder) return [tools];
    const restore = actionButton("fa-solid fa-arrow-down-9-1", "Voltar a ordenar pela iniciativa", () => combat.sortByInitiative(), { shortLabel: "Ordenar pela iniciativa" });
    return [tools, h("div", { class: "combat-manual-order", role: "status" }, h("span", {}, h("i", { class: "fa-solid fa-hand", "aria-hidden": "true" }), " Ordem manual"), restore)];
  }

  #buildFooter(combat: any): HTMLElement {
    const footer = h("footer", { class: "combat-controls" });
    if (!game.user.isGM) {
      footer.append(h("span", { class: "hint" }, combat.started ? "O mestre passa a vez." : "O mestre está definindo a iniciativa."));
      return footer;
    }
    if (!combat.started) {
      footer.append(actionButton("fa-solid fa-play", "Iniciar combate", () => combat.startCombat(), { primary: true }));
      return footer;
    }
    footer.append(
      actionButton("fa-solid fa-backward-fast", "Turno anterior", () => combat.previousRound(), { iconOnly: true }),
      actionButton("fa-solid fa-backward-step", "Voltar a vez", () => combat.previousTurn(), { iconOnly: true }),
      actionButton("fa-solid fa-forward-step", "Passar a vez", () => combat.nextTurn(), { primary: true }),
      actionButton("fa-solid fa-forward-fast", "Próximo turno", () => combat.nextRound(), { iconOnly: true }),
    );
    return footer;
  }
}
