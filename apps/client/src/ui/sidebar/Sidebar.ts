import type { ApplicationConfiguration, RenderOptions } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { CombatTracker } from "../combat/CombatTracker";
import { ChatLog } from "./ChatLog";
import { DIRECTORY_CLASSES } from "./directoryClasses";
import { SIDEBAR_CONTENT_ID } from "./DocumentDirectory";
import { isSidebarCollapsed, setSidebarCollapsed } from "../../game/tableControls";

const SIDEBAR_REOPEN_ID = "sidebar-reopen";

interface SidebarTab {
  tabName: string;
  element: HTMLElement;
  render(options: { force: boolean }): Promise<unknown>;
  clearUnread?(): void;
}

interface SidebarTabClass {
  tabName: string;
  tabLabel: string;
  tabIcon: string;
  documentName?: string;
  isAvailableToUser?(): boolean;
  new (): SidebarTab;
}

function isTabAvailable(tabClass: SidebarTabClass): boolean {
  return tabClass.isAvailableToUser?.() ?? true;
}

const SIDEBAR_TABS: readonly SidebarTabClass[] = [ChatLog as unknown as SidebarTabClass, CombatTracker as unknown as SidebarTabClass, ...(DIRECTORY_CLASSES as unknown as SidebarTabClass[])];

/** Right-hand sidebar hosting the roll log and the document directories as tabs. */
export class Sidebar extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "sidebar",
    tag: "aside",
    classes: ["sidebar"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  activeTab: string = SIDEBAR_TABS[0].tabName;
  readonly tabs: SidebarTab[] = [];
  /** Popped-out sidebar tabs keyed by tab name; tabs never pop out here, but packages probe this map. */
  readonly popouts: Record<string, unknown> = {};

  /** Packages read this to keep overlays clear of the sidebar. */
  get expanded(): boolean {
    return !isSidebarCollapsed();
  }

  get tabGroups(): { primary: string } {
    return { primary: this.activeTab };
  }

  toggleExpanded(expanded?: boolean): void {
    void setSidebarCollapsed(expanded === undefined ? !isSidebarCollapsed() : !expanded);
  }

  override async _onRender(context: object, options: RenderOptions): Promise<void> {
    await super._onRender(context, options);
    this.applyCollapsed();
  }

  /** Slides the sidebar off the right edge, leaving a small tab to bring it back. */
  applyCollapsed(): void {
    const collapsed = isSidebarCollapsed();
    this.element?.classList.toggle("collapsed", collapsed);
    this.element?.setAttribute("aria-hidden", String(collapsed));
    this.element?.toggleAttribute("inert", collapsed);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    let reopen = document.getElementById(SIDEBAR_REOPEN_ID);
    if (!reopen) {
      reopen = h("button", { type: "button", id: SIDEBAR_REOPEN_ID, class: "sidebar-reopen", title: "Mostrar chat, combate e atores", "aria-label": "Mostrar chat, combate e atores", "data-help": "sidebar" }, h("i", { class: "fa-solid fa-chevron-left", "aria-hidden": "true" }), h("i", { class: "fa-solid fa-comments", "aria-hidden": "true" }));
      reopen.addEventListener("click", () => void setSidebarCollapsed(false));
      document.body.append(reopen);
    }
    reopen.hidden = !collapsed;
  }

  buildContent(): Node[] {
    const tabList = h("nav", { class: "sidebar-tabs tabs", role: "tablist" });
    for (const tabClass of SIDEBAR_TABS) {
      const button = h(
        "button",
        { type: "button", class: `item${tabClass.tabName === this.activeTab ? " active" : ""}`, "data-tab": tabClass.tabName, title: tabClass.tabLabel, role: "tab", hidden: !isTabAvailable(tabClass) },
        h("i", { class: tabClass.tabIcon }),
        ` ${tabClass.tabLabel}`,
      );
      button.addEventListener("click", () => this.changeTab(tabClass.tabName));
      tabList.append(button);
    }
    const collapse = h("button", { type: "button", class: "sidebar-collapse icon", title: "Esconder esta barra (chat, combate e atores)", "aria-label": "Esconder esta barra", "data-help": "sidebar" }, h("i", { class: "fa-solid fa-chevron-right", "aria-hidden": "true" }));
    collapse.addEventListener("click", () => void setSidebarCollapsed(true));
    return [h("div", { class: "sidebar-top" }, tabList, collapse), h("div", { id: SIDEBAR_CONTENT_ID })];
  }

  async renderDirectories(): Promise<void> {
    for (const TabClass of SIDEBAR_TABS) {
      const tab = new TabClass();
      ui[TabClass.tabName] = tab;
      this.tabs.push(tab);
      await tab.render({ force: true });
    }
    this.changeTab(this.activeTab);
    this.applyCollapsed();
    if (!game.user.isGM) this.#watchTabAvailability();
  }

  /** Hides tabs whose actions the user cannot take; a tab reappears once something is shared there. */
  refreshTabAvailability(): void {
    for (const tabClass of SIDEBAR_TABS) {
      const button = this.element?.querySelector<HTMLElement>(`.sidebar-tabs [data-tab="${tabClass.tabName}"]`);
      button?.toggleAttribute("hidden", !isTabAvailable(tabClass));
    }
    const active = SIDEBAR_TABS.find((tabClass) => tabClass.tabName === this.activeTab);
    if (active && !isTabAvailable(active)) this.changeTab(ChatLog.tabName);
  }

  #watchTabAvailability(): void {
    const documentNames = new Set(SIDEBAR_TABS.map((tabClass) => tabClass.documentName).filter((name): name is string => Boolean(name)));
    const refresh = () => this.refreshTabAvailability();
    for (const documentName of documentNames) {
      for (const action of ["create", "update", "delete"]) Hooks.on(`${action}${documentName}`, refresh);
    }
  }

  changeTab(tabName: string): void {
    const requested = SIDEBAR_TABS.find((tabClass) => tabClass.tabName === tabName);
    if (requested && !isTabAvailable(requested)) tabName = ChatLog.tabName;
    this.activeTab = tabName;
    for (const button of Array.from(this.element.querySelectorAll<HTMLElement>(".sidebar-tabs [data-tab]"))) {
      button.classList.toggle("active", button.dataset.tab === tabName);
    }
    for (const tab of this.tabs) {
      const isActive = tab.tabName === tabName;
      tab.element?.classList.toggle("active", isActive);
      if (isActive) tab.clearUnread?.();
    }
    if (tabName === ChatLog.tabName) (ui.chat as ChatLog | undefined)?.scrollBottom();
  }
}
