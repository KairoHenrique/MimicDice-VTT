import { CONST, type ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { INHERIT_CHOICE, OWNERSHIP_CHOICES, type OwnershipChoice } from "./ownershipLevels";

const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;

function levelSelect(name: string, selectedLevel: number, choices: readonly OwnershipChoice[]): HTMLSelectElement {
  const select = h("select", { name, "data-dtype": "Number" });
  for (const choice of choices) {
    select.append(h("option", { value: String(choice.level), selected: choice.level === selectedLevel }, choice.label));
  }
  return select;
}

/** GM-only editor for who can see or edit a document (the default level plus per-player overrides). */
export class DocumentOwnershipConfig extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["document-ownership"],
    tag: "form",
    window: { title: "Visibilidade", frame: true, positioned: true, icon: "fa-solid fa-eye", controls: [], minimizable: false, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: 420 },
  };

  constructor(private readonly document: any) {
    super({ id: `ownership-${String(document.uuid).replaceAll(".", "-")}` });
  }

  override get title(): string {
    return `Visibilidade: ${this.document.name}`;
  }

  get #isEmbeddedPage(): boolean {
    return this.document.documentName === "JournalEntryPage";
  }

  buildContent(): Node[] {
    const ownership: Record<string, number> = this.document._source.ownership ?? {};
    const defaultChoices = this.#isEmbeddedPage ? [{ ...INHERIT_CHOICE, label: "Igual ao diário" }, ...OWNERSHIP_CHOICES] : OWNERSHIP_CHOICES;
    const rows: HTMLElement[] = [
      h("p", { class: "hint" }, "Escolha o que os jogadores recebem. Documentos ocultos nem chegam ao navegador deles."),
      h("div", { class: "form-group ownership-default" }, h("label", {}, "Todos os jogadores"), levelSelect("default", ownership.default ?? LEVELS.NONE, defaultChoices)),
    ];
    for (const player of game.users.players) {
      const level = ownership[player.id] ?? LEVELS.INHERIT;
      rows.push(h("div", { class: "form-group" }, h("label", {}, player.name), levelSelect(player.id, level, [INHERIT_CHOICE, ...OWNERSHIP_CHOICES])));
    }
    if (game.users.players.length === 0) rows.push(h("p", { class: "hint" }, "Nenhum jogador cadastrado ainda."));
    const saveButton = h("button", { type: "submit", class: "default" }, h("i", { class: "fa-solid fa-floppy-disk" }), " Salvar");
    return [...rows, h("footer", { class: "form-footer" }, saveButton)];
  }

  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options);
    this.element.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#save();
    });
  }

  async #save(): Promise<void> {
    const form = this.element as HTMLFormElement;
    const current: Record<string, number> = this.document._source.ownership ?? {};
    const changes: Record<string, unknown> = {};
    for (const select of Array.from(form.querySelectorAll<HTMLSelectElement>("select"))) {
      const level = Number(select.value);
      const key = select.name;
      if (level === LEVELS.INHERIT && key !== "default") {
        if (key in current) changes[`ownership.-=${key}`] = null;
      } else if (current[key] !== level) {
        changes[`ownership.${key}`] = level;
      }
    }
    if (Object.keys(changes).length > 0) await this.document.update(changes);
    await this.close();
  }
}
