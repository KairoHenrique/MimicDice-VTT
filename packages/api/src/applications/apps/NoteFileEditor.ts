import { currentUi } from "../../runtime";
import { ApplicationV2, type ApplicationConfiguration, type RenderOptions } from "../ApplicationV2";

const MAX_NOTE_CHARACTERS = 200_000;
const NOTE_NAME_PATTERN = /\.(md|txt)$/i;

export interface NoteFileEditorOptions extends Partial<ApplicationConfiguration> {
  /** Existing note to open; omit to write a new one inside `folder`. */
  path?: string;
  folder?: string;
  onSaved?: (path: string) => unknown;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    /* not JSON */
  }
  return `Falha ao abrir a nota (${response.status})`;
}

function noteFileName(name: string): string {
  const trimmed = name.trim().replace(/[\\/]+/g, "-").slice(0, 100) || "Nota";
  return NOTE_NAME_PATTERN.test(trimmed) ? trimmed : `${trimmed}.md`;
}

/** Plain-text note kept as a `.md`/`.txt` file in the uploads folders; read-only when the folder is not the user's. */
export class NoteFileEditor extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "note-file-{id}",
    classes: ["note-file-editor"],
    window: { title: "Nota", icon: "fa-solid fa-file-pen", resizable: true } as ApplicationConfiguration["window"],
    position: { width: 560, height: 520 },
  };

  static async read(path: string): Promise<{ path: string; content: string; writable: boolean }> {
    const response = await fetch(`/api/files/note?${new URLSearchParams({ path })}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return (await response.json()) as { path: string; content: string; writable: boolean };
  }

  static async write(path: string, content: string): Promise<string> {
    const response = await fetch("/api/files/note", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return ((await response.json()) as { path: string }).path;
  }

  #path: string | null;
  readonly #folder: string;
  readonly #onSaved: NoteFileEditorOptions["onSaved"];
  #content = "";
  #writable = true;
  #loaded = false;

  constructor(options: NoteFileEditorOptions = {}) {
    const { path, folder, onSaved, ...applicationOptions } = options;
    super(applicationOptions);
    this.#path = path ?? null;
    this.#folder = folder ?? "";
    this.#onSaved = onSaved;
  }

  override get title(): string {
    return this.#path ? (this.#path.split("/").pop() ?? "Nota") : "Nova nota";
  }

  override async _prepareContext(_options: RenderOptions): Promise<Record<string, unknown>> {
    if (!this.#loaded && this.#path) {
      const note = await NoteFileEditor.read(this.#path);
      this.#content = note.content;
      this.#writable = note.writable;
    }
    this.#loaded = true;
    return {};
  }

  override async _renderHTML(): Promise<HTMLElement> {
    const form = document.createElement("form");
    form.className = "note-file-form";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 100;
    nameInput.placeholder = "Nome da nota";
    nameInput.setAttribute("aria-label", "Nome da nota");
    nameInput.value = this.#path ? "" : "Nota.md";
    nameInput.hidden = this.#path !== null;
    const text = document.createElement("textarea");
    text.maxLength = MAX_NOTE_CHARACTERS;
    text.value = this.#content;
    text.readOnly = !this.#writable;
    text.placeholder = "Escreva aqui suas anotações.";
    text.setAttribute("aria-label", "Texto da nota");
    const footer = document.createElement("footer");
    footer.className = "note-file-footer";
    if (this.#writable) {
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "primary";
      save.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
      footer.append(save);
    } else {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = "Somente leitura: esta nota está numa pasta compartilhada.";
      footer.append(hint);
    }
    form.append(nameInput, text, footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#save(nameInput.value, text.value);
    });
    return form;
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    content.replaceChildren(result as HTMLElement);
  }

  async #save(name: string, content: string): Promise<void> {
    if (!this.#writable) return;
    const target = this.#path ?? `${this.#folder}/${noteFileName(name)}`;
    try {
      const saved = await NoteFileEditor.write(target, content);
      const isNew = this.#path === null;
      this.#path = saved;
      this.#content = content;
      currentUi()?.notifications?.info("Nota salva.");
      await this.#onSaved?.(saved);
      if (isNew) {
        const heading = this.element?.querySelector(".window-title");
        if (heading) heading.textContent = this.title;
        await this.render({ force: true });
      }
    } catch (error) {
      currentUi()?.notifications?.error(error instanceof Error ? error.message : "Não foi possível salvar a nota");
    }
  }
}
