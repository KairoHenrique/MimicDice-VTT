import type { ApplicationConfiguration } from "@tabbletop/api";
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
      const label = player.isGM ? `${player.name} [Mestre]` : player.name;
      return h("li", { class: `player${player.active ? " active" : " inactive"}${player.isSelf ? " self" : ""}`, "data-user-id": player.id }, indicator, h("span", { class: "player-name" }, label));
    });
    return [h("h3", {}, "Jogadores"), h("ol", { class: "player-list" }, ...items)];
  }
}
