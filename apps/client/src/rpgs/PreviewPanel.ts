import type { RpgEntry } from "@tabbletop/protocol";
import { h } from "../views/dom";
import { fileKindOf, formatBytes, formatDate, iconFor, KIND_LABELS } from "./fileKinds";
import { fileUrl, rpgsApi } from "./rpgsApi";

export interface PreviewActions {
  onRename(entry: RpgEntry): void;
  onMove(entry: RpgEntry): void;
  onDelete(entry: RpgEntry): void;
  onError(message: string): void;
  onInfo(message: string): void;
}

/** Right-hand panel: media preview, an editor for text files, and the entry's actions. */
export class PreviewPanel {
  readonly element = h("aside", { class: "preview-panel", "aria-label": "Detalhes do arquivo" });

  constructor(private readonly actions: PreviewActions) {
    this.clear();
  }

  clear(): void {
    this.element.classList.remove("open");
    this.element.replaceChildren(h("div", { class: "preview-empty" }, h("i", { class: "fa-regular fa-hand-pointer" }), h("p", {}, "Selecione um arquivo para ver os detalhes")));
  }

  async show(entry: RpgEntry): Promise<void> {
    const kind = fileKindOf(entry.name, entry.kind === "folder");
    const closeButton = h("button", { type: "button", class: "icon-button preview-close", title: "Fechar" }, h("i", { class: "fa-solid fa-xmark" }));
    closeButton.addEventListener("click", () => this.clear());
    const header = h("header", { class: "preview-header" }, h("i", { class: `${iconFor(kind)} kind-${kind}` }), h("h2", { title: entry.name }, entry.name), closeButton);
    const meta = h(
      "dl",
      { class: "preview-meta" },
      h("dt", {}, "Tipo"),
      h("dd", {}, KIND_LABELS[kind]),
      ...(entry.kind === "file" ? [h("dt", {}, "Tamanho"), h("dd", {}, formatBytes(entry.size))] : []),
      h("dt", {}, "Modificado"),
      h("dd", {}, formatDate(entry.modified)),
    );
    this.element.replaceChildren(header, await this.#buildPreview(entry, kind), meta, this.#buildActions(entry));
    this.element.classList.add("open");
  }

  async #buildPreview(entry: RpgEntry, kind: ReturnType<typeof fileKindOf>): Promise<HTMLElement> {
    const url = fileUrl(entry.path);
    if (kind === "image") return h("div", { class: "preview-media" }, h("img", { src: url, alt: entry.name }));
    if (kind === "audio") return h("div", { class: "preview-media" }, h("audio", { src: url, controls: true, preload: "metadata" }));
    if (kind === "video") return h("div", { class: "preview-media" }, h("video", { src: url, controls: true, preload: "metadata" }));
    if (kind === "text") return this.#buildTextEditor(entry);
    return h("div", { class: "preview-placeholder" }, h("i", { class: iconFor(kind) }));
  }

  async #buildTextEditor(entry: RpgEntry): Promise<HTMLElement> {
    const textarea = h("textarea", { class: "text-editor", spellcheck: "false", "aria-label": `Conteúdo de ${entry.name}` });
    const saveButton = h("button", { type: "button", class: "primary" }, h("i", { class: "fa-solid fa-floppy-disk" }), " Salvar texto");
    try {
      textarea.value = (await rpgsApi.readText(entry.path)).content;
    } catch (error) {
      textarea.value = "";
      textarea.disabled = true;
      this.actions.onError(error instanceof Error ? error.message : "Não foi possível abrir o texto");
    }
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        await rpgsApi.writeText(entry.path, textarea.value);
        this.actions.onInfo("Texto salvo");
      } catch (error) {
        this.actions.onError(error instanceof Error ? error.message : "Falha ao salvar");
      } finally {
        saveButton.disabled = false;
      }
    });
    textarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveButton.click();
      }
    });
    return h("div", { class: "preview-text" }, textarea, saveButton);
  }

  #buildActions(entry: RpgEntry): HTMLElement {
    const action = (icon: string, label: string, onClick: () => void, className = "") => {
      const button = h("button", { type: "button", class: className }, h("i", { class: icon }), ` ${label}`);
      button.addEventListener("click", onClick);
      return button;
    };
    const buttons: HTMLElement[] = [];
    if (entry.kind === "file") {
      buttons.push(h("a", { class: "button-link", href: fileUrl(entry.path, true), download: entry.name }, h("i", { class: "fa-solid fa-download" }), " Baixar"));
      buttons.push(h("a", { class: "button-link", href: fileUrl(entry.path), target: "_blank", rel: "noopener" }, h("i", { class: "fa-solid fa-up-right-from-square" }), " Abrir"));
    }
    buttons.push(
      action("fa-solid fa-pen", "Renomear", () => this.actions.onRename(entry)),
      action("fa-solid fa-folder-tree", "Mover", () => this.actions.onMove(entry)),
      action("fa-solid fa-trash", "Apagar", () => this.actions.onDelete(entry), "danger"),
    );
    return h("div", { class: "preview-actions" }, ...buttons);
  }
}
