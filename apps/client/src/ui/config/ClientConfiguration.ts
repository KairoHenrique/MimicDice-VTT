import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { buildKeybindingsTab } from "./keybindingsTab";
import { buildSettingsTab } from "./settingsTab";

type ConfigTab = "settings" | "keybindings";

const TABS: ReadonlyArray<{ id: ConfigTab; icon: string; label: string }> = [
  { id: "settings", icon: "fas fa-sliders", label: "Geral" },
  { id: "keybindings", icon: "fas fa-keyboard", label: "Atalhos" },
];

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
      const button = h("button", { type: "button", role: "tab", class: `item${tab.id === this.#activeTab ? " active" : ""}`, "aria-selected": String(tab.id === this.#activeTab) }, h("i", { class: tab.icon }), ` ${tab.label}`);
      button.addEventListener("click", () => {
        this.#activeTab = tab.id;
        void this.render();
      });
      nav.append(button);
    }
    const body = this.#activeTab === "settings" ? buildSettingsTab() : buildKeybindingsTab(() => void this.render());
    return [nav, h("div", { class: "config-body" }, body)];
  }
}
