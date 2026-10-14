import { DocumentSheetV2, type ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DocumentOwnershipConfig } from "../documents/DocumentOwnershipConfig";
import { describeVisibility } from "../documents/ownershipLevels";
import { buildEmbeddedItemsSection } from "./embeddedItemsSection";
import { buildJournalPagesSection } from "./journalPagesSection";
import { buildRollFormulasSection } from "./rollFormulasSection";
import { buildSystemFieldsEditor } from "./systemFieldsEditor";

function imagePathField(currentPath: string): HTMLElement {
  const field = document.createElement("file-picker");
  field.setAttribute("name", "img");
  field.setAttribute("type", "image");
  field.setAttribute("value", currentPath);
  field.setAttribute("placeholder", "Caminho da imagem");
  return field;
}

/** Core fallback sheet built from DOM nodes; systems replace it by registering their own sheet as default. */
export abstract class GenericDocumentSheet extends DocumentSheetV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["tabbletop-sheet"],
    position: { width: 560 },
  };

  abstract buildBody(editable: boolean): Node[];

  protected get showsTypeLabel(): boolean {
    return true;
  }

  protected get showsImagePath(): boolean {
    return true;
  }

  /** Extra controls placed under the document name. */
  protected buildHeaderExtras(_editable: boolean): Node[] {
    return [];
  }

  override async _renderHTML(): Promise<Node[]> {
    if (this.document.limited) return [this.#buildLimitedView()];
    return [this.#buildHeader(this.isEditable), ...this.buildBody(this.isEditable)];
  }

  override _replaceHTML(result: Node[], content: HTMLElement): void {
    content.replaceChildren(...result);
  }

  #buildLimitedView(): HTMLElement {
    return h(
      "div",
      { class: "sheet-limited" },
      this.document.img ? h("img", { class: "profile-img", src: this.document.img, alt: "" }) : null,
      h("h2", {}, this.document.name),
      h("p", { class: "hint" }, "O mestre liberou apenas o nome e a imagem."),
    );
  }

  #buildHeader(editable: boolean): HTMLElement {
    const header = h("header", { class: "sheet-header" });
    const hasImage = "img" in this.document._source;
    if (hasImage) {
      const imageAttributes = editable ? { "data-action": "editImage", "data-edit": "img", title: "Clique para trocar a imagem" } : {};
      header.append(h("img", { class: editable ? "profile-img editable" : "profile-img", src: this.document.img ?? "", alt: "", ...imageAttributes }));
    }
    const details = h(
      "div",
      { class: "sheet-identity" },
      h("input", { type: "text", name: "name", value: this.document.name ?? "", disabled: !editable, "aria-label": "Nome", class: "document-name" }),
    );
    if (hasImage && editable && this.showsImagePath) details.append(imagePathField(this.document._source.img ?? ""));
    if (this.document.constructor.hasTypeData && this.showsTypeLabel) details.append(h("span", { class: "hint" }, `Tipo: ${this.document.type}`));
    details.append(...this.buildHeaderExtras(editable));
    header.append(details);
    if (game.user.isGM && "ownership" in this.document._source) header.append(this.#ownershipButton());
    return header;
  }

  #ownershipButton(): HTMLButtonElement {
    const visibility = describeVisibility(this.document._source.ownership);
    const button = h("button", { type: "button", class: "ownership-button", title: visibility.label }, h("i", { class: visibility.icon }), " Visibilidade");
    button.addEventListener("click", () => void new DocumentOwnershipConfig(this.document).render({ force: true }));
    return button;
  }
}

export class GenericActorSheet extends GenericDocumentSheet {
  buildBody(editable: boolean): Node[] {
    return [buildSystemFieldsEditor(this.document, editable), buildRollFormulasSection(this.document, editable), buildEmbeddedItemsSection(this.document, editable)];
  }
}

export class GenericItemSheet extends GenericDocumentSheet {
  buildBody(editable: boolean): Node[] {
    return [buildSystemFieldsEditor(this.document, editable), buildRollFormulasSection(this.document, editable)];
  }
}

export class GenericJournalSheet extends GenericDocumentSheet {
  buildBody(editable: boolean): Node[] {
    return [buildJournalPagesSection(this.document, editable)];
  }
}
