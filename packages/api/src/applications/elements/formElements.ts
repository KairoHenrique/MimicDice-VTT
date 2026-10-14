import { FilePicker, type FilePickerType } from "../apps/FilePicker";
import type { RichTextEditor } from "../ux/RichTextEditor";
import { TextEditor } from "../ux/TextEditor";

/* Lets the module load outside a browser (unit tests); the elements are only defined where the DOM exists. */
const HTMLElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

/** Shared base for custom elements that take part in `<form>` submission like native inputs. */
abstract class FormValueElement extends HTMLElementBase {
  static formAssociated = true;
  protected readonly internals: ElementInternals;
  protected currentValue = "";

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  get name(): string {
    return this.getAttribute("name") ?? "";
  }

  get value(): string {
    return this.currentValue;
  }

  set value(next: string) {
    this.currentValue = String(next ?? "");
    this.internals.setFormValue(this.currentValue);
    this.onValueChanged();
  }

  get form(): HTMLFormElement | null {
    return this.internals.form;
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  protected abstract onValueChanged(): void;

  protected emitChange(): void {
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** `<file-picker name type value>`: a path input with a browse button (Foundry v13 HTMLFilePickerElement). */
export class HTMLFilePickerElement extends FormValueElement {
  static readonly tagName = "file-picker";
  #input: HTMLInputElement | null = null;

  get type(): FilePickerType {
    return (this.getAttribute("type") as FilePickerType | null) ?? "any";
  }

  connectedCallback(): void {
    if (this.#input) return;
    this.currentValue = this.getAttribute("value") ?? "";
    this.internals.setFormValue(this.currentValue);
    const input = document.createElement("input");
    input.type = "text";
    input.value = this.currentValue;
    input.placeholder = this.getAttribute("placeholder") ?? "";
    input.disabled = this.disabled;
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      this.value = input.value.trim();
      this.emitChange();
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fa-solid fa-file-import fa-fw";
    button.title = "Procurar arquivo";
    button.disabled = this.disabled;
    button.addEventListener("click", () => this.#openPicker());
    this.#input = input;
    this.replaceChildren(input, button);
  }

  protected onValueChanged(): void {
    if (this.#input && this.#input.value !== this.currentValue) this.#input.value = this.currentValue;
  }

  #openPicker(): void {
    const picker = new FilePicker.implementation({
      type: this.type,
      current: this.currentValue,
      callback: (path) => {
        this.value = path;
        this.emitChange();
      },
    });
    void picker.render({ force: true });
  }
}

/** `<prose-mirror name value toggled>`: rich-text field; its initial children are the enriched read view. */
export class HTMLProseMirrorElement extends FormValueElement {
  static readonly tagName = "prose-mirror";
  #display: HTMLElement | null = null;
  #editor: RichTextEditor | null = null;

  get isToggled(): boolean {
    return this.hasAttribute("toggled");
  }

  connectedCallback(): void {
    if (this.#display) return;
    this.currentValue = this.getAttribute("value") ?? this.innerHTML;
    this.internals.setFormValue(this.currentValue);
    const display = document.createElement("div");
    display.className = "editor-content";
    display.append(...Array.from(this.childNodes));
    this.#display = display;
    this.replaceChildren(display);
    if (this.disabled) return;
    if (this.isToggled) this.append(this.#toggleButton());
    else void this.#openEditor();
  }

  protected onValueChanged(): void {}

  #toggleButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle icon fa-solid fa-edit";
    button.title = "Editar";
    button.addEventListener("click", () => void this.#openEditor());
    return button;
  }

  async #openEditor(): Promise<void> {
    if (this.#editor) return;
    this.classList.add("active");
    const host = document.createElement("div");
    host.className = "editor-container";
    this.replaceChildren(host);
    this.#editor = await TextEditor.implementation.create(
      { target: host, onSave: (html) => this.#save(html), onCancel: this.isToggled ? () => this.#closeEditor() : undefined },
      this.currentValue,
    );
  }

  #save(html: string): void {
    this.value = html;
    this.dispatchEvent(new Event("save", { bubbles: false }));
    this.emitChange();
    if (this.isToggled) this.#closeEditor(html);
  }

  #closeEditor(html: string = this.currentValue): void {
    this.#editor?.destroy();
    this.#editor = null;
    this.classList.remove("active");
    const display = this.#display ?? document.createElement("div");
    display.innerHTML = html;
    this.replaceChildren(display, this.#toggleButton());
  }
}

const MAX_TAG_LENGTH = 64;

function parseTags(raw: string): string[] {
  const tags = raw
    .split(",")
    .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
    .filter(Boolean);
  return [...new Set(tags)];
}

/** `<string-tags name value="a,b">`: an editable set of unique text tags submitted as a string array. */
export class HTMLStringTagsElement extends HTMLElementBase {
  static formAssociated = true;
  static readonly tagName = "string-tags";
  readonly #internals: ElementInternals;
  #tags: string[] = [];
  #list: HTMLElement | null = null;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  get name(): string {
    return this.getAttribute("name") ?? "";
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  get value(): string[] {
    return [...this.#tags];
  }

  set value(next: string[] | string) {
    this.#tags = Array.isArray(next) ? parseTags(next.join(",")) : parseTags(String(next ?? ""));
    this.#internals.setFormValue(this.#tags.join(","));
    this.#renderTags();
  }

  connectedCallback(): void {
    if (this.#list) return;
    this.#list = document.createElement("div");
    this.#list.className = "tags input-element-tags";
    this.replaceChildren(this.#list);
    this.value = this.getAttribute("value") ?? "";
    if (!this.disabled) this.append(this.#buildInput());
  }

  #buildInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Nova tag e Enter";
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.#commit([...this.#tags, input.value]);
      input.value = "";
    });
    input.addEventListener("change", (event) => event.stopPropagation());
    return input;
  }

  #commit(tags: string[]): void {
    this.value = tags;
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  #renderTags(): void {
    if (!this.#list) return;
    const chips = this.#tags.map((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = tag;
      if (!this.disabled) {
        const remove = document.createElement("a");
        remove.className = "remove fa-solid fa-times";
        remove.title = "Remover";
        remove.addEventListener("click", () => this.#commit(this.#tags.filter((existing) => existing !== tag)));
        chip.append(remove);
      }
      return chip;
    });
    this.#list.replaceChildren(...chips);
  }
}

export function defineFormElements(): void {
  if (typeof customElements === "undefined") return;
  for (const elementClass of [HTMLFilePickerElement, HTMLProseMirrorElement, HTMLStringTagsElement]) {
    if (!customElements.get(elementClass.tagName)) customElements.define(elementClass.tagName, elementClass);
  }
}
