import type { ApplicationConfiguration } from "@tabbletop/api";
import { isMapLocked, pullPlayersToViewedScene, toggleMapLock } from "../game/tableControls";
import { serverApi } from "../net/apiClient";
import { h } from "../views/dom";
import { ActorCreationDialog } from "./actors/ActorCreationDialog";
import { findOwnCharacter } from "./actors/ownCharacter";
import { DomApplication } from "./DomApplication";
import { ModuleManagement } from "./ModuleManagement";
import { UserManagement } from "./UserManagement";
import { WorldManager } from "./WorldManager";

export class HostToolbar extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "host-toolbar",
    tag: "nav",
    classes: ["host-toolbar"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  buildContent(): Node[] {
    const brand = h("span", { class: "host-brand", title: "MimicDice VTT" }, h("i", { class: "fa-solid fa-dice-d20" }));
    const buttons: HTMLElement[] = [brand, h("span", { class: "world-title" }, game.world.title)];
    if (game.user?.isGM) {
      const locked = isMapLocked();
      const lockButton = this.#button(locked ? "fas fa-lock" : "fas fa-lock-open", locked ? "Mapa travado" : "Travar mapa", () => toggleMapLock());
      lockButton.classList.toggle("active", locked);
      lockButton.title = locked ? "Os jogadores não mexem em nada no mapa. Clique para liberar." : "Impede os jogadores de mover tokens e criar coisas no mapa.";
      const pullButton = this.#button("fas fa-people-pulling", "Puxar todos", () => pullPlayersToViewedScene(game.socket));
      pullButton.title = "Leva todos os jogadores para a cena que você está vendo.";
      buttons.push(
        lockButton,
        pullButton,
        this.#button("fas fa-door-open", "Salas", () => new WorldManager().render({ force: true })),
        this.#button("fas fa-puzzle-piece", "Módulos", () => new ModuleManagement().render({ force: true })),
        this.#button("fas fa-users", "Jogadores", () => new UserManagement().render({ force: true })),
        this.#button("fas fa-folder-open", "Arquivos", () => window.open("/rpgs", "_blank", "noopener")),
      );
    } else {
      buttons.push(this.#characterButton());
      if (isMapLocked()) buttons.push(h("span", { class: "map-locked-badge", title: "O mestre travou o mapa" }, h("i", { class: "fas fa-lock" }), " Mapa travado"));
    }
    buttons.push(
      this.#button("fas fa-right-from-bracket", "Sair", async () => {
        await serverApi.logout();
        window.location.reload();
      }),
    );
    return buttons;
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
