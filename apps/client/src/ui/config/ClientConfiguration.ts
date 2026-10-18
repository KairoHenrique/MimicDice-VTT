import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { buildGameMasterRulesTab } from "./gameMasterRulesTab";
import { buildKeybindingsTab } from "./keybindingsTab";
import { buildPasswordTab } from "./passwordTab";
import { buildSettingsTab } from "./settingsTab";
import { buildAudioTab } from "./audioTab";

type ConfigTab = "settings" | "audio" | "rules" | "keybindings" | "password";

const TABS: ReadonlyArray<{ id: ConfigTab; icon: string; label: string; gameMasterOnly?: boolean }> = [
  { id: "settings", icon: "fas fa-sliders", label: "Geral" },
  { id: "audio", icon: "fas fa-volume-high", label: "Áudio" },
  { id: "rules", icon: "fas fa-crown", label: "Controle do mestre", gameMasterOnly: true },
  { id: "keybindings", icon: "fas fa-keyboard", label: "Atalhos" },
  { id: "password", icon: "fas fa-key", label: "Senha do mestre", gameMasterOnly: true },
];

function buildTabBody(tab: ConfigTab, rerender: () => void): HTMLElement {
  if (tab === "audio") return buildAudioTab();
  if (tab === "keybindings") return buildKeybindingsTab(rerender);
  if (tab === "rules" && game.user.isGM) return buildGameMasterRulesTab(rerender);
  if (tab === "password" && game.user.isGM) return buildPasswordTab();
  return buildSettingsTab();
}

/** Per-user preferences and key bindings; world-wide options only appear for the GM. */
export class ClientConfiguration extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "client-configuration",
    classes: ["client-configuration"],
    window: { title: "Configurações", frame: true, positioned: true, icon: false, controls: [], minimizable: true, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: 560, height: 600 },
  };

  #activeTab: ConfigTab = "settings";

  static open(tab: ConfigTab = "settings"): void {
    const existing = Array.from(foundry.applications.instances.values()).find((app: unknown) => app instanceof ClientConfiguration) as ClientConfiguration | undefined;
    const app = existing ?? new ClientConfiguration();
    app.#activeTab = tab;
    void app.render({ force: true });
  }

  buildContent(): Node[] {
    const nav = h("nav", { class: "config-tabs tabs", role: "tablist" });
    for (const tab of TABS) {
      if (tab.gameMasterOnly && !game.user.isGM) continue;
      const button = h("button", { type: "button", role: "tab", class: `item${tab.id === this.#activeTab ? " active" : ""}`, "aria-selected": String(tab.id === this.#activeTab) }, h("i", { class: tab.icon }), ` ${tab.label}`);
      button.addEventListener("click", () => {
        this.#activeTab = tab.id;
        void this.render();
      });
      nav.append(button);
    }
    return [nav, h("div", { class: "config-body" }, buildTabBody(this.#activeTab, () => void this.render()))];
  }
}
