export interface RichTextEditorOptions {
  target: HTMLElement;
  height?: number;
  onSave?: (html: string) => unknown;
  onCancel?: () => unknown;
  pickImage?: () => Promise<string | null>;
}

interface ToolbarCommand {
  icon: string;
  title: string;
  run: (editor: RichTextEditor) => void | Promise<void>;
}

const BLOCK_FORMATS: ReadonlyArray<[string, string]> = [
  ["p", "Parágrafo"],
  ["h1", "Título 1"],
  ["h2", "Título 2"],
  ["h3", "Título 3"],
  ["blockquote", "Citação"],
];

function exec(command: string, value?: string): void {
  document.execCommand(command, false, value);
}

const TOOLBAR_COMMANDS: readonly ToolbarCommand[] = [
  { icon: "fa-solid fa-bold", title: "Negrito", run: () => exec("bold") },
  { icon: "fa-solid fa-italic", title: "Itálico", run: () => exec("italic") },
  { icon: "fa-solid fa-underline", title: "Sublinhado", run: () => exec("underline") },
  { icon: "fa-solid fa-strikethrough", title: "Riscado", run: () => exec("strikeThrough") },
  { icon: "fa-solid fa-list-ul", title: "Lista", run: () => exec("insertUnorderedList") },
  { icon: "fa-solid fa-list-ol", title: "Lista numerada", run: () => exec("insertOrderedList") },
  { icon: "fa-solid fa-link", title: "Link", run: (editor) => editor.insertLink() },
  { icon: "fa-solid fa-image", title: "Imagem", run: (editor) => editor.insertImage() },
  { icon: "fa-solid fa-user-secret", title: "Bloco secreto (só dono e mestre)", run: (editor) => editor.insertSecret() },
  { icon: "fa-solid fa-eraser", title: "Limpar formatação", run: () => exec("removeFormat") },
];

/**
 * Lightweight rich-text editor (contenteditable) standing in for Foundry's ProseMirror integration. It only
 * produces markup; the server sanitizes every stored HTML field, and pasted content is inserted as plain text.
 */
export class RichTextEditor {
  readonly container: HTMLElement;
  readonly content: HTMLElement;
  readonly #options: RichTextEditorOptions;
  readonly #initialHtml: string;
  #destroyed = false;

  constructor(options: RichTextEditorOptions, initialHtml: string) {
    this.#options = options;
    this.#initialHtml = initialHtml;
    this.container = document.createElement("div");
    this.container.className = "rich-editor";
    this.content = document.createElement("div");
    this.content.className = "rich-editor-content editor-content";
    this.content.contentEditable = "true";
    this.content.innerHTML = initialHtml;
    if (options.height) this.content.style.minHeight = `${options.height}px`;
    this.content.addEventListener("paste", (event) => this.#pasteAsText(event));
    this.content.addEventListener("keydown", (event) => this.#onKeyDown(event));
    this.container.append(this.#buildToolbar(), this.content);
    options.target.replaceChildren(this.container);
    this.content.focus();
  }

  get isDirty(): boolean {
    return this.getHTML() !== this.#initialHtml;
  }

  getHTML(): string {
    return this.content.innerHTML;
  }

  async save(): Promise<void> {
    if (this.#destroyed) return;
    await this.#options.onSave?.(this.getHTML());
  }

  destroy(): void {
    this.#destroyed = true;
    this.container.remove();
  }

  insertLink(): void {
    const url = window.prompt("Endereço do link (https://...)")?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    exec("createLink", url);
  }

  async insertImage(): Promise<void> {
    const source = this.#options.pickImage ? await this.#options.pickImage() : window.prompt("Caminho da imagem");
    if (!source) return;
    this.content.focus();
    const image = document.createElement("img");
    image.src = source.startsWith("http") || source.startsWith("/") ? source : `/${source}`;
    image.alt = "";
    exec("insertHTML", image.outerHTML);
  }

  insertSecret(): void {
    const section = document.createElement("section");
    section.className = "secret";
    const paragraph = document.createElement("p");
    paragraph.textContent = window.getSelection()?.toString() || "Texto secreto";
    section.append(paragraph);
    exec("insertHTML", section.outerHTML);
  }

  #buildToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "rich-editor-toolbar";
    toolbar.append(this.#buildFormatSelect());
    for (const command of TOOLBAR_COMMANDS) toolbar.append(this.#toolbarButton(command.icon, command.title, () => command.run(this)));
    const saveButton = this.#toolbarButton("fa-solid fa-floppy-disk", "Salvar (Ctrl+S)", () => this.save());
    saveButton.classList.add("save");
    toolbar.append(saveButton);
    if (this.#options.onCancel) toolbar.append(this.#toolbarButton("fa-solid fa-xmark", "Cancelar", () => this.#options.onCancel?.()));
    return toolbar;
  }

  #buildFormatSelect(): HTMLSelectElement {
    const select = document.createElement("select");
    select.title = "Formato do bloco";
    for (const [tag, label] of BLOCK_FORMATS) select.append(new Option(label, tag));
    select.addEventListener("change", () => {
      this.content.focus();
      exec("formatBlock", select.value);
    });
    return select;
  }

  #toolbarButton(icon: string, title: string, onClick: () => unknown): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.title = title;
    button.className = "rich-editor-button";
    const iconElement = document.createElement("i");
    iconElement.className = icon;
    button.append(iconElement);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => void onClick());
    return button;
  }

  #pasteAsText(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    exec("insertText", text);
  }

  #onKeyDown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void this.save();
    }
  }
}
