import type { ApplicationConfiguration } from "@tabbletop/api";
import type { ActorRole, SheetLayout } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import { DomApplication } from "../../../DomApplication";
import { EMPTY_LAYOUT } from "../sheetLayoutRules";
import { saveTemplateDialog } from "../templateDialogs";
import { BoardEditor } from "./BoardEditor";

const EDITOR_WIDTH = 1180;
const EDITOR_HEIGHT = 760;

/** The builder only reads an actor to preview values; a model made from scratch previews an empty character. */
function blankPreviewActor(): any {
  const types: string[] = CONFIG.Actor?.documentClass?.TYPES ?? [];
  const type = types.find((candidate) => candidate !== "base") ?? types[0] ?? "base";
  return {
    documentName: "Actor",
    type,
    name: "Modelo",
    isOwner: false,
    system: {},
    _source: { type, system: {}, flags: {} },
    items: new Map(),
    getRollData: () => ({}),
    getFlag: () => undefined,
    testUserPermission: () => false,
  };
}

/** GM-only: builds a sheet model from a blank page, with no character involved, and saves it as a template. */
export class SheetTemplateEditor extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["mimicdice-sheet", "sheet-template-editor"],
    window: { title: "Novo modelo de ficha", frame: true, positioned: true, icon: "fa-solid fa-pen-ruler", controls: [], minimizable: true, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: EDITOR_WIDTH, height: EDITOR_HEIGHT },
  };

  #layout: SheetLayout = EMPTY_LAYOUT;
  readonly #editor: BoardEditor;

  constructor(private readonly role: ActorRole = "npc") {
    super({ id: "sheet-template-editor" });
    this.#editor = new BoardEditor(blankPreviewActor(), this.#layout, async (layout) => {
      this.#layout = layout;
    }, null);
  }

  static open(role: ActorRole = "npc"): void {
    if (!game.user.isGM) return;
    const width = Math.min(EDITOR_WIDTH, window.innerWidth - 32);
    const height = Math.min(EDITOR_HEIGHT, window.innerHeight - 32);
    void new SheetTemplateEditor(role).render({ force: true, position: { width, height } });
  }

  buildContent(): Node[] {
    const save = h("button", { type: "button", class: "default" }, h("i", { class: "fa-solid fa-floppy-disk" }), " Salvar modelo");
    save.addEventListener("click", () => void this.#save());
    const hint = h("p", { class: "hint" }, "Monte a ficha arrastando os componentes da esquerda. Ao salvar, escolha o nome e para quem é o modelo (jogador, NPC ou inimigo).");
    return [h("div", { class: "md-toolbar" }, hint, save), this.#editor.render()];
  }

  async #save(): Promise<void> {
    await this.#editor.flush();
    const hasComponents = this.#layout.pages.some((page) => page.components.length > 0);
    if (!hasComponents) {
      ui.notifications.warn("Adicione pelo menos um componente antes de salvar o modelo.");
      return;
    }
    await saveTemplateDialog(this.#layout, this.role, "Novo modelo");
  }

  override async close(options: { animate?: boolean } = {}): Promise<this> {
    await this.#editor.flush();
    return super.close(options);
  }
}
