import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { createSampleScenes } from "../canvas/sampleScenes";
import { DocumentOwnershipConfig } from "../documents/DocumentOwnershipConfig";
import { describeVisibility } from "../documents/ownershipLevels";
import { DomApplication } from "../DomApplication";
import { describeWhereabouts, indexItemWhereabouts, type ItemWhereabouts } from "../items/itemLocations";

export const SIDEBAR_CONTENT_ID = "sidebar-content";

/** Lists the documents of one world collection the current user can see; class names mirror Foundry's for render hooks. */
export abstract class DocumentDirectory extends DomApplication {
  static documentName = "";
  static tabName = "";
  static tabLabel = "";
  static tabIcon = "";

  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["directory", "sidebar-tab", "tab"],
    tag: "section",
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  /** Players only get a tab when they can create something there or have something shared with them to see. */
  static isAvailableToUser(): boolean {
    if (game.user.isGM) return true;
    const collection = game.collections.get(this.documentName);
    return Boolean(collection?.documentClass?.canUserCreate?.(game.user)) || (collection?.size ?? 0) > 0;
  }

  constructor() {
    const directoryClass = new.target as unknown as typeof DocumentDirectory;
    super({ id: directoryClass.tabName });
    this.collection.apps.push(this);
  }

  get documentName(): string {
    return (this.constructor as typeof DocumentDirectory).documentName;
  }

  get collection(): any {
    return game.collections.get(this.documentName);
  }

  get tabName(): string {
    return (this.constructor as typeof DocumentDirectory).tabName;
  }

  override _insertElement(element: HTMLElement): void {
    const container = document.getElementById(SIDEBAR_CONTENT_ID);
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (container ?? document.body).append(element);
  }

  buildContent(): Node[] {
    const documentClass = this.collection.documentClass;
    const header = h("header", { class: "directory-header" });
    if (documentClass.canUserCreate(game.user)) {
      const createButton = h("button", { type: "button", class: "create-document" }, h("i", { class: "fa-solid fa-plus" }), ` ${this.createLabel}`);
      createButton.addEventListener("click", () => void this.onCreateClick());
      header.append(createButton);
    }
    const entries = this.filterDocuments(this.#sortedDocuments()).map((entry) => this.#buildEntry(entry));
    const list = h("ol", { class: "directory-list" }, ...entries);
    if (entries.length === 0) list.append(h("li", { class: "directory-empty hint" }, this.emptyMessage));
    return [header, ...this.buildToolbar(), list];
  }

  protected get createLabel(): string {
    return "Criar";
  }

  protected get emptyMessage(): string {
    return "Nada por aqui ainda.";
  }

  protected onCreateClick(): unknown {
    return this.collection.documentClass.createDialog({}, {});
  }

  /** Controls placed between the header and the list (filters, search). */
  protected buildToolbar(): Node[] {
    return [];
  }

  protected filterDocuments(documents: any[]): any[] {
    return documents;
  }

  /** Small markers shown after the entry name. */
  protected entryBadges(_entry: any): Node[] {
    return [];
  }

  #sortedDocuments(): any[] {
    return this.collection.contents.sort((left: any, right: any) => (left.sort ?? 0) - (right.sort ?? 0) || String(left.name).localeCompare(String(right.name), "pt-BR"));
  }

  /** Default action when an entry is clicked: open its sheet. */
  protected onEntryClick(entry: any): void {
    void entry.sheet?.render(true);
  }

  /** Click entry point named after Foundry's so packages (e.g. Item Piles) can wrap it. */
  async _onClickEntry(event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    const entry = this.collection.get(target.closest<HTMLElement>("[data-entry-id]")?.dataset.entryId ?? "");
    if (entry) this.onEntryClick(entry);
  }

  /** Directories are always docked in Tabbletop; popping out just focuses the tab. */
  async renderPopout(): Promise<this> {
    ui.sidebar?.changeTab?.(this.tabName);
    return this;
  }

  _onSearchFilter(_event: Event, _query: string, _rgx: RegExp, _html: HTMLElement): void {}

  /** Extra per-entry buttons placed before the visibility and delete controls. */
  protected buildExtraControls(_entry: any): HTMLElement[] {
    return [];
  }

  protected entryThumbnail(entry: any): HTMLElement {
    return entry.img ? h("img", { class: "thumbnail", src: entry.img, alt: "", loading: "lazy" }) : h("i", { class: "thumbnail fa-solid fa-book" });
  }

  /** Optional second line under the entry name. */
  protected entrySubtitle(_entry: any): HTMLElement | null {
    return null;
  }

  #buildEntry(entry: any): HTMLElement {
    const title = h("span", { class: "entry-name" }, entry.name);
    const subtitle = this.entrySubtitle(entry);
    const name = subtitle ? h("span", { class: "entry-name-stack" }, title, subtitle) : title;
    const item = h("li", { class: "directory-item document", "data-document-id": entry.id, "data-entry-id": entry.id, draggable: "true" }, this.entryThumbnail(entry), name, ...this.entryBadges(entry));
    if (entry.limited) item.append(h("i", { class: "fa-solid fa-eye-low-vision entry-limited", title: "Você vê apenas nome e imagem" }));
    item.addEventListener("click", (event) => void this._onClickEntry(event, item));
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", JSON.stringify(entry.toDragData()));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    });

    const controls = h("span", { class: "entry-controls" }, ...this.buildExtraControls(entry));
    if (game.user.isGM) {
      const visibility = describeVisibility(entry._source.ownership);
      controls.append(this.#control(visibility.icon, `Visibilidade: ${visibility.label}`, () => new DocumentOwnershipConfig(entry).render({ force: true })));
    }
    if (entry.canUserModify(game.user, "delete") && (game.user.isGM || entry.isOwner)) {
      controls.append(this.#control("fa-solid fa-trash", "Excluir", () => entry.deleteDialog()));
    }
    item.append(controls);
    return item;
  }

  protected control(icon: string, label: string, onClick: () => unknown): HTMLButtonElement {
    return this.#control(icon, label, onClick);
  }

  #control(icon: string, label: string, onClick: () => unknown): HTMLButtonElement {
    const button = h("button", { type: "button", class: "icon entry-control", title: label, "aria-label": label }, h("i", { class: icon }));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void onClick();
    });
    return button;
  }
}

/** The GM also sees, under each item, who carries a copy and on which maps one lies on the floor. */
export class ItemDirectory extends DocumentDirectory {
  static override documentName = "Item";
  static override tabName = "items";
  static override tabLabel = "Itens";
  static override tabIcon = "fa-solid fa-suitcase";

  #whereabouts = new Map<string, ItemWhereabouts>();

  protected override filterDocuments(documents: any[]): any[] {
    this.#whereabouts = game.user.isGM ? indexItemWhereabouts(game.actors?.contents ?? [], (game.scenes?.contents ?? []).map((scene: any) => ({ name: scene.name, tiles: scene.tiles?.contents ?? [] }))) : new Map();
    return documents;
  }

  protected override entrySubtitle(entry: any): HTMLElement | null {
    const text = describeWhereabouts(this.#whereabouts.get(entry.uuid));
    return text ? h("span", { class: "md-item-where", title: text }, h("i", { class: "fa-solid fa-location-dot", "aria-hidden": "true" }), ` ${text}`) : null;
  }
}

export class JournalDirectory extends DocumentDirectory {
  static override documentName = "JournalEntry";
  static override tabName = "journal";
  static override tabLabel = "Diário";
  static override tabIcon = "fa-solid fa-book-open";
}

/** Scenes: a click views the scene (GM only sees inactive ones); extra buttons activate or configure it. */
export class SceneDirectory extends DocumentDirectory {
  static override documentName = "Scene";
  static override tabName = "scenes";
  static override tabLabel = "Cenas";
  static override tabIcon = "fa-solid fa-map";

  /** Players are moved between scenes by the GM, so the list would only offer actions they cannot take. */
  static override isAvailableToUser(): boolean {
    return game.user.isGM;
  }

  protected override onEntryClick(entry: any): void {
    void entry.view();
  }

  protected override entryThumbnail(entry: any): HTMLElement {
    const thumbnail = entry.thumbnail;
    return thumbnail ? h("img", { class: "thumbnail", src: thumbnail, alt: "", loading: "lazy" }) : h("i", { class: `thumbnail fa-solid ${entry.active ? "fa-bullseye" : "fa-map"}` });
  }

  protected override buildToolbar(): Node[] {
    if (!game.user.isGM) return [];
    const button = h("button", { type: "button", class: "sample-scenes", title: "Cria uma taverna, uma floresta e uma masmorra prontas para testar" }, h("i", { class: "fa-solid fa-wand-magic-sparkles" }), " Cenas de exemplo");
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const created = await createSampleScenes();
        ui.notifications.info(created > 0 ? `${created} cena(s) de exemplo criada(s).` : "As cenas de exemplo já existem.");
      } catch {
        ui.notifications.error("Não foi possível criar as cenas de exemplo.");
      } finally {
        button.disabled = false;
      }
    });
    return [button];
  }

  protected override buildExtraControls(entry: any): HTMLElement[] {
    if (!game.user.isGM) return [];
    const controls = [this.control("fa-solid fa-gear", "Configurar cena", () => entry.sheet?.render(true))];
    if (!entry.active) controls.unshift(this.control("fa-solid fa-play", "Ativar para todos", () => entry.activate()));
    return controls;
  }
}

/** Compendium packs are not supported yet; the class exists so packages can wrap its prototype. */
export class CompendiumDirectory extends DomApplication {
  buildContent(): Node[] {
    return [];
  }

  _onSearchFilter(_event: Event, _query: string, _rgx: RegExp, _html: HTMLElement): void {}

  async renderPopout(): Promise<this> {
    return this;
  }
}
