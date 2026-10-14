import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { ChatLog } from "./ChatLog";
import { DIRECTORY_CLASSES } from "./directoryClasses";
import { SIDEBAR_CONTENT_ID } from "./DocumentDirectory";

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
  new (): SidebarTab;
}

const SIDEBAR_TABS: readonly SidebarTabClass[] = [ChatLog as unknown as SidebarTabClass, ...(DIRECTORY_CLASSES as unknown as SidebarTabClass[])];

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

  /** The sidebar is always open; packages read this to keep overlays clear of it. */
  get expanded(): boolean {
    return true;
  }

  get tabGroups(): { primary: string } {
    return { primary: this.activeTab };
  }

  toggleExpanded(_expanded?: boolean): void {}

  buildContent(): Node[] {
    const tabList = h("nav", { class: "sidebar-tabs tabs", role: "tablist" });
    for (const tabClass of SIDEBAR_TABS) {
      const button = h(
        "button",
        { type: "button", class: `item${tabClass.tabName === this.activeTab ? " active" : ""}`, "data-tab": tabClass.tabName, title: tabClass.tabLabel, role: "tab" },
        h("i", { class: tabClass.tabIcon }),
        ` ${tabClass.tabLabel}`,
      );
      button.addEventListener("click", () => this.changeTab(tabClass.tabName));
      tabList.append(button);
    }
    return [tabList, h("div", { id: SIDEBAR_CONTENT_ID })];
  }

  async renderDirectories(): Promise<void> {
    for (const TabClass of SIDEBAR_TABS) {
      const tab = new TabClass();
      ui[TabClass.tabName] = tab;
      this.tabs.push(tab);
      await tab.render({ force: true });
    }
    this.changeTab(this.activeTab);
  }

  changeTab(tabName: string): void {
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
