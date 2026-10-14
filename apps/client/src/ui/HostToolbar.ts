import type { ApplicationConfiguration, RenderOptions } from "@tabbletop/api";
import { isGmEditMode, isMapLocked, isToolbarCollapsed, pullPlayersToViewedScene, toggleGmEditMode, toggleMapLock, toggleToolbarCollapsed } from "../game/tableControls";
import { serverApi } from "../net/apiClient";
import { h } from "../views/dom";
import { ActorCreationDialog } from "./actors/ActorCreationDialog";
import { ClientConfiguration } from "./config/ClientConfiguration";
import { findOwnCharacter } from "./actors/ownCharacter";
import { DomApplication } from "./DomApplication";
import { ModuleManagement } from "./ModuleManagement";
import { UserManagement } from "./UserManagement";

export class HostToolbar extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "host-toolbar",
    tag: "nav",
    classes: ["host-toolbar"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  #heightObserver: ResizeObserver | null = null;

  /** Publishes where the toolbar ends so the scene bar and controls sit below it even when it wraps. */
  override async _onFirstRender(context: object, options: RenderOptions): Promise<void> {
    await super._onFirstRender(context, options);
    const element = this.element;
    if (!element) return;
    this.#heightObserver = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--host-toolbar-bottom", `${Math.ceil(element.getBoundingClientRect().bottom)}px`);
    });
    this.#heightObserver.observe(element);
  }

  override async _onRender(context: object, options: RenderOptions): Promise<void> {
    await super._onRender(context, options);
    this.element?.classList.toggle("collapsed", isToolbarCollapsed());
  }

  buildContent(): Node[] {
    const brand = h("span", { class: "host-brand", title: "MimicDice VTT" }, h("i", { class: "fa-solid fa-dice-d20" }));
    if (isToolbarCollapsed()) return [brand, this.#collapseButton(true)];
    const buttons: HTMLElement[] = [brand, h("span", { class: "world-title" }, game.world.title)];
    if (game.user?.isGM) buttons.push(...this.#gameMasterButtons());
    else buttons.push(...this.#playerButtons());
    buttons.push(
      this.#button("fas fa-gear", "Configurações", () => ClientConfiguration.open()),
      this.#button("fas fa-right-from-bracket", "Sair", async () => {
        await serverApi.logout();
        window.location.reload();
      }),
      this.#collapseButton(false),
    );
    return buttons;
  }

  #gameMasterButtons(): HTMLElement[] {
    const locked = isMapLocked();
    const lockButton = this.#button(locked ? "fas fa-lock" : "fas fa-lock-open", locked ? "Mapa travado" : "Travar mapa", () => toggleMapLock());
    lockButton.classList.toggle("active", locked);
    lockButton.title = locked ? "Os jogadores não mexem em nada no mapa. Clique para liberar." : "Impede os jogadores de mover tokens e criar coisas no mapa.";
    const pullButton = this.#button("fas fa-people-pulling", "Puxar todos", () => pullPlayersToViewedScene(game.socket));
    pullButton.title = "Leva todos os jogadores para a cena que você está vendo.";
    const shareViewButton = this.#button("fas fa-eye", "Mostrar minha visão", () => pullPlayersToViewedScene(game.socket, true));
    shareViewButton.title = "Leva todos para esta cena com a mesma posição e o mesmo zoom da sua tela.";
    return [
      this.#modeButton(),
      lockButton,
      pullButton,
      shareViewButton,
      this.#button("fas fa-puzzle-piece", "Módulos", () => new ModuleManagement().render({ force: true })),
      this.#button("fas fa-users", "Jogadores", () => new UserManagement().render({ force: true })),
      this.#button("fas fa-folder-open", "Arquivos", () => window.open("/rpgs", "_blank", "noopener")),
    ];
  }

  #playerButtons(): HTMLElement[] {
    const buttons: HTMLElement[] = [this.#characterButton()];
    if (isMapLocked()) buttons.push(h("span", { class: "map-locked-badge", title: "O mestre travou o mapa" }, h("i", { class: "fas fa-lock" }), " Mapa travado"));
    return buttons;
  }

  #collapseButton(collapsed: boolean): HTMLButtonElement {
    const label = collapsed ? "Mostrar a barra" : "Recolher a barra";
    const button = h("button", { type: "button", class: "toolbar-collapse icon", title: label, "aria-label": label, "aria-expanded": String(!collapsed) }, h("i", { class: collapsed ? "fas fa-chevron-right" : "fas fa-chevron-left" }));
    button.addEventListener("click", () => void toggleToolbarCollapsed());
    return button;
  }

  #modeButton(): HTMLButtonElement {
    const editing = isGmEditMode();
    const button = this.#button(editing ? "fas fa-pen-ruler" : "fas fa-chess-knight", editing ? "Modo edição" : "Modo jogo", () => toggleGmEditMode());
    button.classList.toggle("active", editing);
    button.title = editing ? "Paredes, luzes e tiles liberados. Clique para voltar ao modo jogo." : "Só tokens, desenhos e notas, sem arrastar paredes sem querer. Clique para editar o mapa.";
    return button;
  }

  #characterButton(): HTMLButtonElement {
    const character = findOwnCharacter(game.user);
    if (character) return this.#button("fas fa-user-shield", "Meu personagem", () => character.sheet?.render(true));
    const button = this.#button("fas fa-user-plus", "Criar personagem", () => new ActorCreationDialog().render({ force: true }));
    button.classList.add("primary");
    return button;
  }

  #button(icon: string, label: string, onClick: () => unknown): HTMLButtonElement {
    const button = h("button", { type: "button", title: label }, h("i", { class: icon }), ` ${label}`);
    button.addEventListener("click", () => void onClick());
    return button;
  }
}
