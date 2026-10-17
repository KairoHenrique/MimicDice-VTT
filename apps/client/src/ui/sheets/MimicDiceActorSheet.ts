import type { ApplicationConfiguration } from "@tabbletop/api";
import type { ActorRole, SheetLayout } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { applyTemplateToActor, assignPlayerOwner, changeActorRole, saveActorLayout } from "../actors/actorAssignment";
import { actorRole, LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE, playerOwnersOf, ROLE_PRESENTATION } from "../actors/actorRoles";
import { buildEmbeddedItemsSection } from "./embeddedItemsSection";
import { GenericDocumentSheet } from "./GenericDocumentSheet";
import { BoardContext } from "./layout/boardContext";
import { buildBoardView } from "./layout/boardView";
import { BoardEditor } from "./layout/editor/BoardEditor";
import { SheetTemplateEditor } from "./layout/editor/SheetTemplateEditor";
import { allComponents, EMPTY_LAYOUT, readLayout } from "./layout/sheetLayoutRules";
import { exportActorSheet, importActorSheet } from "./layout/sheetExchange";
import { defaultTemplateFor } from "./layout/sheetTemplateStore";
import { valueRootForActorType } from "./layout/sheetValueRoot";
import { chooseTemplateDialog, roleSelect, saveTemplateDialog } from "./layout/templateDialogs";
import { buildRollPrivacyToggle } from "./npcRollPrivacy";
import { buildAbilitiesSection } from "./abilitiesSection";
import { buildSystemFieldsEditor } from "./systemFieldsEditor";
import { actorVariants, chooseActorVariantsDialog, chooseVariantDialog } from "./sheetVariants";
import { playersEditSheets } from "../../game/tableRules";
import { buildAppearanceStrip } from "../actors/appearances";
import { draggedItem } from "../items/inventorySync";
import { moveItemToActor } from "../items/itemExchange";
import { buildLinkedSheets, isSheetShared, shareSheetDialog } from "../actors/sheetSharing";
import { sendSheetPing } from "./sheetPings";

type SheetTab = "sheet" | "rolls" | "items";

const DEFAULT_WIDTH = 760;
const EDITOR_WIDTH = 1180;

const TABS: ReadonlyArray<{ id: SheetTab; label: string; icon: string }> = [
  { id: "sheet", label: "Ficha", icon: "fa-solid fa-id-card" },
  { id: "rolls", label: "Habilidades", icon: "fa-solid fa-wand-sparkles" },
  { id: "items", label: "Itens", icon: "fa-solid fa-suitcase" },
];

type ToolbarAction = { icon: string; label: string; onClick: () => unknown };

function toolbarButton(icon: string, label: string, onClick: () => unknown, active = false): HTMLButtonElement {
  const button = h("button", { type: "button", class: `md-toolbar-button${active ? " active" : ""}` }, h("i", { class: icon }), ` ${label}`);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void Promise.resolve(onClick()).catch((error: Error) => ui.notifications.warn(error.message));
  });
  return button;
}

function toolbarMenu(actions: ToolbarAction[]): HTMLElement | null {
  if (actions.length === 0) return null;
  const wrap = h("div", { class: "md-toolbar-menu" });
  const trigger = h(
    "button",
    { type: "button", class: "md-toolbar-button md-toolbar-more", title: "Mais opções da ficha", "aria-label": "Mais opções da ficha", "aria-haspopup": "menu", "aria-expanded": "false" },
    h("i", { class: "fa-solid fa-ellipsis-vertical", "aria-hidden": "true" }),
  );
  const panel = h("div", { class: "md-toolbar-dropdown", role: "menu", hidden: "true" });
  let dismiss: ((event: MouseEvent) => void) | null = null;
  const close = () => {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (dismiss) {
      document.removeEventListener("click", dismiss);
      dismiss = null;
    }
  };
  const open = () => {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    dismiss = (event) => {
      if (!wrap.contains(event.target as Node)) close();
    };
    setTimeout(() => {
      if (dismiss) document.addEventListener("click", dismiss);
    }, 0);
  };
  for (const action of actions) {
    const item = h("button", { type: "button", role: "menuitem" }, h("i", { class: action.icon, "aria-hidden": "true" }), ` ${action.label}`);
    item.addEventListener("click", (event) => {
      event.preventDefault();
      close();
      void Promise.resolve(action.onClick()).catch((error: Error) => ui.notifications.warn(error.message));
    });
    panel.append(item);
  }
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (panel.hidden) open();
    else close();
  });
  wrap.append(trigger, panel);
  return wrap;
}

/** MimicDice sheet: the layout (sections and typed fields) lives in the actor, so each actor can be shaped freely. */
export class MimicDiceActorSheet extends GenericDocumentSheet {
  /** Sheet ids are `scope.ClassName` and get stored in actors, so the name must survive minification. */
  static {
    Object.defineProperty(this, "name", { value: "MimicDiceActorSheet" });
  }

  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["tabbletop-sheet", "mimicdice-sheet"],
    position: { width: DEFAULT_WIDTH, height: 780 },
  };

  #activeTab: SheetTab = "sheet";
  #editing = false;
  #editor: BoardEditor | null = null;
  #activePageId: string | null = null;
  #pingModeActive = false;

  get layout(): SheetLayout {
    return readLayout(this.document.getFlag(MIMICDICE_FLAG_SCOPE, LAYOUT_FLAG_KEY)) ?? EMPTY_LAYOUT;
  }

  protected override get showsTypeLabel(): boolean {
    return false;
  }

  protected override get showsImagePath(): boolean {
    return false;
  }

  buildBody(editable: boolean): Node[] {
    if (!editable) this.#editing = false;
    return [this.#buildTabs(), h("div", { class: "md-tab-panel" }, ...this.#buildActivePanel(editable))];
  }

  protected override buildHeaderExtras(editable: boolean): Node[] {
    const role = actorRole(this.document);
    const meta = h("div", { class: "md-meta" });
    if (game.user.isGM) {
      meta.append(this.#roleControl(role), this.#ownerControl(), this.#shareControl(), this.#pingControl());
      const rollPrivacy = buildRollPrivacyToggle(this.document);
      if (rollPrivacy) meta.append(rollPrivacy);
    } else {
      const presentation = ROLE_PRESENTATION[role];
      meta.append(h("span", { class: `md-role-badge role-${role}` }, h("i", { class: presentation.icon }), ` ${presentation.label}`));
    }
    const looks = buildAppearanceStrip(this.document);
    const extras: Node[] = editable ? [meta, this.#buildToolbar(role)] : [meta];
    if (looks) extras.push(looks);
    const linked = buildLinkedSheets(this.document, this.#linkedSheetViewers());
    if (linked) extras.push(linked);
    return extras;
  }

  /** The GM sees what the character's player got; a player sees it only on their own character. */
  #linkedSheetViewers(): string[] {
    const ownerIds = playerOwnersOf(this.document).map((user: any) => user.id);
    if (game.user.isGM) return ownerIds;
    return ownerIds.includes(game.user.id) ? [game.user.id] : [];
  }

  #roleControl(role: ActorRole): HTMLElement {
    const select = roleSelect("", role);
    select.removeAttribute("name");
    select.addEventListener("change", () => void changeActorRole(this.document, select.value as ActorRole));
    return h("label", { class: `md-meta-field role-${role}` }, h("i", { class: ROLE_PRESENTATION[role].icon }), select);
  }

  #ownerControl(): HTMLElement {
    const currentOwnerId = playerOwnersOf(this.document)[0]?.id ?? "";
    const select = h("select", { "aria-label": "Jogador dono", title: "Jogador que controla esta ficha" }, h("option", { value: "" }, "Sem jogador (só o mestre)"));
    for (const player of game.users.players) select.append(h("option", { value: player.id, selected: player.id === currentOwnerId }, `Jogador: ${player.name}`));
    select.addEventListener("change", () => void assignPlayerOwner(this.document, select.value || null));
    return h("label", { class: "md-meta-field" }, h("i", { class: "fa-solid fa-user" }), select);
  }

  #shareControl(): HTMLButtonElement {
    const shared = isSheetShared(this.document);
    const label = shared ? "Compartilhada" : "Compartilhar";
    const button = h("button", { type: "button", class: `md-toolbar-button${shared ? " active" : ""}`, title: "Escolher quais jogadores veem ou editam esta ficha" }, h("i", { class: "fa-solid fa-share-nodes", "aria-hidden": "true" }), ` ${label}`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void shareSheetDialog(this.document).catch((error: Error) => ui.notifications.warn(error.message));
    });
    return button;
  }

  #pingControl(): HTMLButtonElement {
    const button = h(
      "button",
      {
        type: "button",
        class: `md-toolbar-button${this.#pingModeActive ? " active" : ""}`,
        title: "Destacar para o jogador: clique para ativar o modo de destaque (ou segure Alt + clique em qualquer campo)",
      },
      h("i", { class: "fa-solid fa-bullseye", "aria-hidden": "true" }),
      " Destacar",
    );
    button.addEventListener("click", (event) => {
      event.preventDefault();
      this.#pingModeActive = !this.#pingModeActive;
      this.element?.classList.toggle("md-sheet-ping-mode", this.#pingModeActive);
      if (this.#pingModeActive) {
        ui.notifications.info("Modo destaque: clique em qualquer campo ou perícia para apontar na tela do jogador.");
      }
      void this.render();
    });
    return button;
  }

  /** Players edit only when the GM allows it, and never a layout holding GM-only components (the editor could reveal or drop them). */
  #canChangeLayout(): boolean {
    if (game.user.isGM) return true;
    return playersEditSheets() && !allComponents(this.layout).some((component) => component.gmOnly);
  }

  #buildToolbar(role: ActorRole): HTMLElement {
    const toolbar = h("div", { class: "md-toolbar" });
    const actions: ToolbarAction[] = [];
    if (this.#canChangeLayout()) {
      if (this.#editing) {
        toolbar.append(toolbarButton("fa-solid fa-check", "Concluir edição", () => this.#toggleEditing(), true));
      } else {
        actions.push({ icon: "fa-solid fa-pen-ruler", label: "Editar ficha", onClick: () => this.#toggleEditing() });
      }
      actions.push({ icon: "fa-solid fa-wand-magic-sparkles", label: "Modelos", onClick: () => this.#applyTemplate(role) });
    } else if (actorVariants(this.document).length > 0) {
      actions.push({ icon: "fa-solid fa-repeat", label: "Trocar modelo", onClick: () => chooseVariantDialog(this.document) });
    }
    if (game.user.isGM) {
      actions.push(
        { icon: "fa-solid fa-floppy-disk", label: "Salvar como modelo", onClick: () => saveTemplateDialog(this.layout, role, this.document.name) },
        { icon: "fa-solid fa-file-circle-plus", label: "Novo modelo do zero", onClick: () => SheetTemplateEditor.open(role) },
        { icon: "fa-solid fa-layer-group", label: "Modelos do jogador", onClick: () => chooseActorVariantsDialog(this.document) },
      );
    }
    if (this.#canChangeLayout()) {
      actions.push(
        { icon: "fa-solid fa-file-import", label: "Importar", onClick: () => this.#importSheet(role) },
        { icon: "fa-solid fa-file-export", label: "Exportar", onClick: () => exportActorSheet(this.document.name, role, this.layout) },
      );
    }
    const menu = toolbarMenu(actions);
    if (menu) toolbar.append(menu);
    return toolbar;
  }

  async #toggleEditing(): Promise<void> {
    if (this.#editing && this.#editor) {
      await this.#editor.flush();
      this.#activePageId = this.#editor.pageId;
      this.#editor = null;
    }
    this.#editing = !this.#editing;
    this.#activeTab = "sheet";
    this.#fitWidth();
    void this.render();
  }

  #fitWidth(): void {
    const margin = 16;
    const currentWidth = Number(this.position?.width) || DEFAULT_WIDTH;
    const desired = this.#editing ? Math.max(currentWidth, EDITOR_WIDTH) : Math.min(currentWidth, DEFAULT_WIDTH);
    const width = Math.min(desired, window.innerWidth - margin * 2);
    const currentLeft = Number(this.position?.left) || margin;
    const left = Math.max(margin, Math.min(currentLeft, window.innerWidth - width - margin));
    this.setPosition({ width, left });
  }

  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    void this.#giveDefaultSheetIfMissing();
    this.#acceptItemDrops();
    this.#setupSheetPingListener();
  }

  /** Dropping an Items-tab entry on the sheet puts a copy in this character's inventory. */
  #acceptItemDrops(): void {
    const root = this.element;
    if (!root) return;
    root.addEventListener("dragover", (event) => {
      if (this.document.canEditSheet() && event.dataTransfer?.types.includes("text/plain")) event.preventDefault();
    });
    root.addEventListener("drop", (event) => {
      const item = draggedItem(event.dataTransfer?.getData("text/plain"));
      if (!item || item.parent === this.document) return;
      event.preventDefault();
      void moveItemToActor(item, this.document);
    });
  }

  /** Actors created elsewhere (imports, quick "Criar", tokens) start with the default sheet of their type. */
  async #giveDefaultSheetIfMissing(): Promise<void> {
    if (!this.document.isOwner || this.document.getFlag(MIMICDICE_FLAG_SCOPE, LAYOUT_FLAG_KEY) !== undefined || this.#hasLegacyFields()) return;
    const template = defaultTemplateFor(actorRole(this.document));
    if (template) await applyTemplateToActor(this.document, template);
  }

  override async close(options: { animate?: boolean } = {}): Promise<this> {
    await this.#editor?.flush();
    this.#editor = null;
    this.#editing = false;
    return super.close(options);
  }

  async #applyTemplate(role: ActorRole): Promise<void> {
    const template = await chooseTemplateDialog(role);
    if (!template) return;
    await applyTemplateToActor(this.document, template);
    ui.notifications.info(`Modelo "${template.name}" aplicado.`);
  }

  async #importSheet(role: ActorRole): Promise<void> {
    const layout = await importActorSheet(this.document.name);
    if (!layout) return;
    await applyTemplateToActor(this.document, { id: "imported", name: this.document.name, role, layout });
    ui.notifications.info("Ficha importada.");
  }

  #buildTabs(): HTMLElement {
    const nav = h("nav", { class: "md-tabs", role: "tablist" });
    for (const tab of TABS) {
      const count = tab.id === "items" ? ` (${this.document.items?.size ?? 0})` : "";
      const button = h("button", { type: "button", class: `md-tab${tab.id === this.#activeTab ? " active" : ""}`, role: "tab", "aria-selected": String(tab.id === this.#activeTab) }, h("i", { class: tab.icon }), ` ${tab.label}${count}`);
      button.addEventListener("click", () => {
        this.#activeTab = tab.id;
        void this.render();
      });
      nav.append(button);
    }
    return nav;
  }

  #buildActivePanel(editable: boolean): Node[] {
    if (this.#activeTab === "rolls") return [buildAbilitiesSection(this.document, editable)];
    if (this.#activeTab === "items") return [buildEmbeddedItemsSection(this.document, editable)];
    const layout = this.layout;
    if (this.#editing && this.#canChangeLayout()) return [this.#editorFor(layout).render()];
    const context = new BoardContext(this.document, layout, editable);
    const panel: Node[] = [buildBoardView(context, layout, { activePageId: this.#activePageId, onSelectPage: (pageId) => this.#showPage(pageId) })];
    if (allComponents(layout).length === 0 && this.#hasLegacyFields()) panel.push(buildSystemFieldsEditor(this.document, editable));
    return panel;
  }

  #hasLegacyFields(): boolean {
    return valueRootForActorType(this.document.type) === "system" && Object.keys(this.document._source.system ?? {}).length > 0;
  }

  #editorFor(layout: SheetLayout): BoardEditor {
    if (this.#editor) {
      this.#editor.syncFromDocument(layout);
      return this.#editor;
    }
    this.#editor = new BoardEditor(this.document, layout, (next) => saveActorLayout(this.document, next), this.#activePageId);
    return this.#editor;
  }

  #showPage(pageId: string): void {
    this.#activePageId = pageId;
    void this.render();
  }

  setTab(tab: SheetTab): void {
    if (this.#activeTab !== tab) {
      this.#activeTab = tab;
      void this.render();
    }
  }

  setPage(pageId: string): void {
    if (this.#activePageId !== pageId) {
      this.#activePageId = pageId;
      void this.render();
    }
  }

  #setupSheetPingListener(): void {
    const root = this.element;
    if (!root) return;
    root.addEventListener(
      "click",
      (event: MouseEvent) => {
        if (!game.user.isGM) return;
        if (!event.altKey && !this.#pingModeActive) return;
        event.preventDefault();
        event.stopPropagation();
        this.#handlePingClick(event);
      },
      true,
    );
  }

  #handlePingClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const skillEl = target.closest<HTMLElement>("[data-skill-key]");
    const compEl = target.closest<HTMLElement>("[data-component-id]");
    const abilityEl = target.closest<HTMLElement>("[data-ability-id]");
    const itemEl = target.closest<HTMLElement>("[data-item-id]");

    if (skillEl) {
      const skillKey = skillEl.dataset.skillKey;
      const label = skillEl.querySelector(".md-skill-name")?.textContent?.trim() || "Perícia";
      sendSheetPing({ actorId: this.document.id, tab: "sheet", pageId: this.#activePageId ?? undefined, skillKey, label: `Perícia ${label}` });
    } else if (compEl) {
      const componentId = compEl.dataset.componentId;
      const label = compEl.querySelector(".md-field-label, .md-c-title, .md-c-label")?.textContent?.trim() || "Campo";
      sendSheetPing({ actorId: this.document.id, tab: "sheet", pageId: this.#activePageId ?? undefined, componentId, label });
    } else if (abilityEl) {
      const abilityId = abilityEl.dataset.abilityId;
      const label = abilityEl.querySelector(".md-ability-title, input")?.textContent?.trim() || (abilityEl.querySelector("input") as HTMLInputElement)?.value || "Habilidade";
      sendSheetPing({ actorId: this.document.id, tab: "rolls", abilityId, label: `Habilidade: ${label}` });
    } else if (itemEl) {
      const itemId = itemEl.dataset.itemId;
      const label = itemEl.querySelector(".entry-name")?.textContent?.trim() || "Item";
      sendSheetPing({ actorId: this.document.id, tab: "items", itemId, label: `Item: ${label}` });
    } else {
      sendSheetPing({ actorId: this.document.id, tab: this.#activeTab, pageId: this.#activePageId ?? undefined, label: "Ficha" });
    }

    if (this.#pingModeActive) {
      this.#pingModeActive = false;
      this.element?.classList.remove("md-sheet-ping-mode");
      void this.render();
    }
  }
}
