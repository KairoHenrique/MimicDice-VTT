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
import { allComponents, EMPTY_LAYOUT, readLayout } from "./layout/sheetLayoutRules";
import { exportActorSheet } from "./layout/sheetExchange";
import { defaultTemplateFor } from "./layout/sheetTemplateStore";
import { valueRootForActorType } from "./layout/sheetValueRoot";
import { chooseTemplateDialog, roleSelect, saveTemplateDialog } from "./layout/templateDialogs";
import { buildRollFormulasSection } from "./rollFormulasSection";
import { buildSystemFieldsEditor } from "./systemFieldsEditor";
import { actorVariants, chooseActorVariantsDialog, chooseVariantDialog } from "./sheetVariants";
import { playersEditSheets } from "../../game/tableRules";
import { buildAppearanceStrip } from "../actors/appearances";

type SheetTab = "sheet" | "rolls" | "items";

const DEFAULT_WIDTH = 760;
const EDITOR_WIDTH = 1180;

const TABS: ReadonlyArray<{ id: SheetTab; label: string; icon: string }> = [
  { id: "sheet", label: "Ficha", icon: "fa-solid fa-id-card" },
  { id: "rolls", label: "Rolagens", icon: "fa-solid fa-dice" },
  { id: "items", label: "Itens", icon: "fa-solid fa-suitcase" },
];

function toolbarButton(icon: string, label: string, onClick: () => unknown, active = false): HTMLButtonElement {
  const button = h("button", { type: "button", class: `md-toolbar-button${active ? " active" : ""}` }, h("i", { class: icon }), ` ${label}`);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void Promise.resolve(onClick()).catch((error: Error) => ui.notifications.warn(error.message));
  });
  return button;
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
      meta.append(this.#roleControl(role), this.#ownerControl());
    } else {
      const presentation = ROLE_PRESENTATION[role];
      meta.append(h("span", { class: `md-role-badge role-${role}` }, h("i", { class: presentation.icon }), ` ${presentation.label}`));
    }
    const looks = buildAppearanceStrip(this.document);
    const extras: Node[] = editable ? [meta, this.#buildToolbar(role)] : [meta];
    if (looks) extras.push(looks);
    return extras;
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

  /** Players edit only when the GM allows it, and never a layout holding GM-only components (the editor could reveal or drop them). */
  #canChangeLayout(): boolean {
    if (game.user.isGM) return true;
    return playersEditSheets() && !allComponents(this.layout).some((component) => component.gmOnly);
  }

  #buildToolbar(role: ActorRole): HTMLElement {
    const toolbar = h("div", { class: "md-toolbar" });
    if (this.#canChangeLayout()) {
      toolbar.append(
        toolbarButton(this.#editing ? "fa-solid fa-check" : "fa-solid fa-pen-ruler", this.#editing ? "Concluir edição" : "Editar ficha", () => this.#toggleEditing(), this.#editing),
        toolbarButton("fa-solid fa-wand-magic-sparkles", "Modelos", () => this.#applyTemplate(role)),
      );
    } else if (actorVariants(this.document).length > 0) {
      toolbar.append(toolbarButton("fa-solid fa-repeat", "Trocar modelo", () => chooseVariantDialog(this.document)));
    }
    if (game.user.isGM) {
      toolbar.append(
        toolbarButton("fa-solid fa-floppy-disk", "Salvar como modelo", () => saveTemplateDialog(this.layout, role, this.document.name)),
        toolbarButton("fa-solid fa-layer-group", "Modelos do jogador", () => chooseActorVariantsDialog(this.document)),
      );
    }
    if (this.#canChangeLayout()) toolbar.append(toolbarButton("fa-solid fa-file-export", "Exportar", () => exportActorSheet(this.document.name, role, this.layout)));
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
    if (this.#activeTab === "rolls") return [buildRollFormulasSection(this.document, editable)];
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
}
