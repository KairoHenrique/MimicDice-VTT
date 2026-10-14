import type { ApplicationConfiguration } from "@tabbletop/api";
import { playerPuppetEntries } from "../game/puppetControl";
import { h } from "../views/dom";
import { DomApplication } from "./DomApplication";

interface PlayerEntry {
  id: string;
  name: string;
  color: string;
  active: boolean;
  isGM: boolean;
  isSelf: boolean;
}

export class Players extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "players",
    tag: "aside",
    classes: ["players-list"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const players: PlayerEntry[] = game.users.map((user: any) => ({
      id: user.id,
      name: user.name,
      color: user.color,
      active: user.active,
      isGM: user.isGM,
      isSelf: user.isSelf,
    }));
    players.sort((left, right) => Number(right.active) - Number(left.active) || left.name.localeCompare(right.name));
    return { players };
  }

  buildContent(context: Record<string, unknown>): Node[] {
    const players = context.players as PlayerEntry[];
    const items = players.map((player) => {
      const indicator = h("span", { class: "player-active" });
      indicator.style.background = player.active ? player.color : "transparent";
      indicator.style.borderColor = player.color;
      const gameMasterMark = player.isGM ? h("i", { class: "fa-solid fa-crown player-gm", title: "Mestre", "aria-label": "Mestre" }) : null;
      const status = h("span", { class: "visually-hidden" }, player.active ? "(online)" : "(offline)");
      const item = h("li", { class: `player${player.active ? " active" : " inactive"}${player.isSelf ? " self" : ""}`, "data-user-id": player.id }, indicator, h("span", { class: "player-name" }, player.name), gameMasterMark, status);
      if (game.user.isGM && !player.isGM) {
        item.title = "Botão direito: controlar o boneco deste jogador";
        item.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          const user = game.users.get(player.id);
          if (user) canvas.hud?.openMenuAt(playerPuppetEntries(user), { x: event.clientX, y: event.clientY });
        });
      }
      return item;
    });
    return [h("h3", {}, "Jogadores"), h("ol", { class: "player-list" }, ...items)];
  }
}
