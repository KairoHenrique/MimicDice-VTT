import type { ApplicationConfiguration, RenderOptions } from "@tabbletop/api";
import { isGmEditMode, isMapLocked, isToolbarCollapsed, shareGameMasterView, toggleGmEditMode, toggleMapLock, toggleToolbarCollapsed } from "../game/tableControls";
import { isScenePaused, toggleScenePause } from "../game/scenePause";
import { isTableSessionOpen, toggleTableSession } from "../game/tableSession";
import { configurePlayerVision, playerVisionLabel, playerVisionLimit } from "../game/playerVision";
import { serverApi } from "../net/apiClient";
import { h } from "../views/dom";
import { ActorCreationDialog } from "./actors/ActorCreationDialog";
import { ClientConfiguration } from "./config/ClientConfiguration";
import { findOwnCharacter } from "./actors/ownCharacter";
import { DomApplication } from "./DomApplication";
import { ModuleManagement } from "./ModuleManagement";
import { HelpDialog } from "./help/HelpDialog";
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
    const identity = h("div", { class: "toolbar-identity" }, h("img", { class: "host-brand", src: "/logo.png", alt: "", title: "MimicDice VTT", width: 32, height: 32 }), h("span", { class: "world-title", title: game.world.title }, game.world.title));
    if (isToolbarCollapsed()) return [identity, this.#collapseButton(true)];
    const groups = game.user?.isGM ? this.#gameMasterGroups() : this.#playerGroups();
    const account = this.#group(
      "Conta",
      this.#button("fas fa-circle-question", "Tutorial (Shift + clique em qualquer botão mostra a ajuda dele)", () => HelpDialog.open(), "icon", "start"),
      this.#button("fas fa-gear", "Configurações", () => ClientConfiguration.open(), "icon", "toolbar:settings"),
      this.#button("fas fa-right-from-bracket", "Sair", async () => {
        await serverApi.logout();
        window.location.reload();
      }, "icon"),
    );
    return [identity, ...groups, account, this.#collapseButton(false)];
  }

  #group(label: string, ...children: Array<HTMLElement | null>): HTMLElement {
    return h("div", { class: "toolbar-group", role: "group", "aria-label": label }, ...children);
  }

  #gameMasterGroups(): HTMLElement[] {
    const locked = isMapLocked();
    const lockButton = this.#button(locked ? "fas fa-lock" : "fas fa-lock-open", locked ? "Mapa travado" : "Travar mapa", () => toggleMapLock(), "full", "toolbar:lock");
    lockButton.classList.toggle("active", locked);
    lockButton.title = locked ? "Os jogadores não mexem em nada no mapa. Clique para liberar." : "Impede os jogadores de mover tokens e criar coisas no mapa.";
    const visionLimited = playerVisionLimit() > 0;
    const visionButton = this.#button(visionLimited ? "fas fa-eye-low-vision" : "fas fa-binoculars", playerVisionLabel(), () => configurePlayerVision(), "compact", "toolbar:vision");
    visionButton.classList.toggle("active", visionLimited);
    visionButton.title = visionLimited ? `${playerVisionLabel()}: os jogadores só enxergam até essa distância dos seus tokens. Clique para mudar.` : "Limitar até onde os jogadores enxergam. Para puxar jogadores, clique com o botão direito num ponto vazio do mapa.";
    const shareViewButton = this.#button("fas fa-eye", "Mostrar minha visão", () => shareGameMasterView(game.socket), "compact", "toolbar:share-view");
    shareViewButton.title = "Mostrar minha visão: leva todos para esta cena com a mesma posição e zoom da sua tela.";
    const paused = isScenePaused();
    const pauseButton = this.#button(paused ? "fas fa-play" : "fas fa-pause", paused ? "Retomar cena" : "Pausar cena", () => toggleScenePause(), "full", "toolbar:pause");
    pauseButton.classList.toggle("active", paused);
    pauseButton.title = paused ? "Os jogadores estão vendo a tela de pausa. Clique para mostrar a cena de novo." : "Cobre o mapa dos jogadores e trava tudo enquanto você prepara a cena. Dados, chat e fichas continuam funcionando.";
    return [
      this.#group("Sessão", this.#sessionButton()),
      this.#group("Mapa", this.#modeButton(), pauseButton, lockButton),
      this.#group("Jogadores na mesa", visionButton, shareViewButton),
      this.#group(
        "Administração",
        this.#button("fas fa-puzzle-piece", "Módulos", () => new ModuleManagement().render({ force: true }), "icon", "toolbar:modules"),
        this.#button("fas fa-users", "Jogadores", () => new UserManagement().render({ force: true }), "icon", "toolbar:users"),
        this.#button("fas fa-folder-open", "Arquivos", () => window.open("/rpgs", "_blank", "noopener"), "icon", "toolbar:files"),
      ),
    ];
  }

  #sessionButton(): HTMLButtonElement {
    const open = isTableSessionOpen();
    const button = this.#button(open ? "fas fa-door-closed" : "fas fa-door-open", open ? "Fechar sessão" : "Iniciar sessão", () => toggleTableSession(), "full", "toolbar:session");
    button.classList.add(open ? "active" : "primary");
    button.title = open
      ? "Sessão em andamento. Clique para fechar: os jogadores ficam congelados na última visão. Ela também fecha sozinha depois de 1 hora sem ninguém mexer."
      : "Os jogadores estão congelados. Clique para iniciar a sessão e liberar o mapa para eles.";
    return button;
  }

  #playerGroups(): HTMLElement[] {
    const sessionBadge = isTableSessionOpen() ? null : h("span", { class: "map-locked-badge", title: "O mestre ainda não iniciou a sessão" }, h("i", { class: "fas fa-moon" }), " Sessão fechada");
    const badge = isMapLocked() ? h("span", { class: "map-locked-badge", title: "O mestre travou o mapa" }, h("i", { class: "fas fa-lock" }), " Mapa travado") : null;
    return [this.#group("Personagem", this.#characterButton(), sessionBadge, badge)];
  }

  #collapseButton(collapsed: boolean): HTMLButtonElement {
    const label = collapsed ? "Mostrar a barra" : "Recolher a barra";
    const button = h("button", { type: "button", class: "toolbar-collapse icon", title: label, "aria-label": label, "aria-expanded": String(!collapsed) }, h("i", { class: collapsed ? "fas fa-chevron-right" : "fas fa-chevron-left" }));
    button.addEventListener("click", () => void toggleToolbarCollapsed());
    return button;
  }

  #modeButton(): HTMLButtonElement {
    const editing = isGmEditMode();
    const button = this.#button(editing ? "fas fa-pen-ruler" : "fas fa-chess-knight", editing ? "Modo edição" : "Modo jogo", () => toggleGmEditMode(), "full", "toolbar:mode");
    button.classList.toggle("active", editing);
    button.title = editing ? "Paredes, luzes e tiles liberados. Clique para voltar ao modo jogo." : "Só tokens, desenhos e notas, sem arrastar paredes sem querer. Clique para editar o mapa.";
    return button;
  }

  #characterButton(): HTMLButtonElement {
    const character = findOwnCharacter(game.user);
    if (character) return this.#button("fas fa-user-shield", "Meu personagem", () => character.sheet?.render(true), "full", "toolbar:character");
    const button = this.#button("fas fa-user-plus", "Criar personagem", () => new ActorCreationDialog().render({ force: true }), "full", "toolbar:character");
    button.classList.add("primary");
    return button;
  }

  /** "icon" never shows the label; "compact" hides it on narrow screens; the tooltip and aria-label always carry it. */
  #button(icon: string, label: string, onClick: () => unknown, labelMode: "full" | "compact" | "icon" = "full", helpTopic?: string): HTMLButtonElement {
    const button = h(
      "button",
      { type: "button", class: labelMode === "full" ? "" : `label-${labelMode}`, title: label, "aria-label": label, "data-help": helpTopic },
      h("i", { class: icon, "aria-hidden": "true" }),
      labelMode === "icon" ? null : h("span", { class: "button-label" }, label),
    );
    button.addEventListener("click", () => void onClick());
    return button;
  }
}
