import { currentConfig, currentUi } from "../../runtime";
import { parseS3URL } from "../../utils/routes";
import { ApplicationV2, type ApplicationConfiguration, type RenderOptions } from "../ApplicationV2";
import { DialogV2 } from "../DialogV2";
import { createFilePickerView, type FilePickerViewModel } from "./filePickerView";
import { joinUploadFolder, MAX_FOLDER_UPLOAD_FILES, relativeUploadsFromDataTransfer, relativeUploadsFromFileList, trimFolderUpload, type RelativeUpload } from "./folderUpload";
import { NoteFileEditor } from "./NoteFileEditor";

const NOTE_FILE_PATTERN = /\.(md|txt)$/i;

export type FilePickerType = "image" | "audio" | "video" | "imagevideo" | "font" | "text" | "folder" | "any";

export interface FilePickerBrowseResult {
  target: string;
  private: boolean;
  gridSize: number | null;
  dirs: string[];
  files: string[];
  extensions: string[];
  writable: boolean;
  parent?: string | null;
  labels?: Record<string, string>;
  shareable?: Record<string, boolean>;
}

export interface FilePickerOptions extends Partial<ApplicationConfiguration> {
  type?: FilePickerType;
  current?: string;
  callback?: (path: string, picker: FilePicker) => unknown;
  field?: HTMLInputElement | null;
  button?: HTMLElement | null;
  activeSource?: string;
  browseOnly?: boolean;
}

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"];
const VIDEO_EXTENSIONS = [".webm", ".mp4", ".m4v"];
const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".oga", ".wav", ".flac", ".m4a", ".webm"];
const EXTENSIONS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  image: IMAGE_EXTENSIONS,
  video: VIDEO_EXTENSIONS,
  imagevideo: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS],
  audio: AUDIO_EXTENSIONS,
  font: [".woff", ".woff2", ".ttf", ".otf"],
  text: [".txt", ".json", ".md", ".html"],
};
const DEFAULT_UPLOAD_DIRECTORY = "uploads";

/** Turns any path a package may hand over (absolute URL, leading slash, URL-encoded) into a data-relative path. */
export function normalizeDataPath(path: unknown): string {
  let text = String(path ?? "").trim();
  if (text.startsWith(window.location.origin)) text = text.slice(window.location.origin.length);
  text = text.split(/[?#]/)[0] ?? "";
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep the raw text */
  }
  return text.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function dataPathToUrl(path: string): string {
  return `/${normalizeDataPath(path).split("/").map(encodeURIComponent).join("/")}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    /* not JSON */
  }
  return `Falha na operação de arquivo (${response.status})`;
}

/** `FilePicker`: browses the table's data folders and uploads files, mirroring Foundry's static API. */
export class FilePicker extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "file-picker-{id}",
    classes: ["file-picker"],
    window: { title: "Selecionar arquivo", icon: "fa-solid fa-file-import", resizable: true } as ApplicationConfiguration["window"],
    position: { width: 640, height: 560 },
  };

  static readonly FILE_TYPES = Object.keys(EXTENSIONS_BY_TYPE);
  static readonly LAST_BROWSED_DIRECTORY = { value: DEFAULT_UPLOAD_DIRECTORY };

  static get implementation(): typeof FilePicker {
    return (currentConfig()?.ux?.FilePicker as typeof FilePicker | undefined) ?? FilePicker;
  }

  static parse(target: string) {
    const current = normalizeDataPath(target);
    return { current, source: "data", bucket: null, fullPath: current };
  }

  static matchS3URL(): null {
    return null;
  }

  static parseS3URL(key: string): { bucket: string | null; keyPrefix: string } {
    return parseS3URL(key);
  }

  static async browse(_source = "data", target = "", options: { extensions?: string[] } = {}): Promise<FilePickerBrowseResult> {
    const params = new URLSearchParams({ target: normalizeDataPath(target) });
    if (options.extensions?.length) params.set("extensions", options.extensions.join(","));
    const response = await fetch(`/api/files/browse?${params}`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    const body = (await response.json()) as Pick<FilePickerBrowseResult, "target" | "dirs" | "files" | "writable" | "parent" | "labels" | "shareable">;
    return { ...body, private: false, gridSize: null, extensions: options.extensions ?? [] };
  }

  static async upload(_source: string, path: string, file: File, _body: object = {}, { notify = true }: { notify?: boolean } = {}) {
    const params = new URLSearchParams({ target: normalizeDataPath(path), name: file.name });
    const response = await fetch(`/api/files/upload?${params}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      const message = await readErrorMessage(response);
      if (notify) currentUi()?.notifications?.error(message);
      return false;
    }
    const { path: storedPath } = (await response.json()) as { path: string };
    const message = `"${file.name}" enviado.`;
    if (notify) currentUi()?.notifications?.info(message);
    return { status: "success", path: storedPath, message };
  }

  static uploadPersistent(packageId: string, path: string, file: File, body: object = {}, options: { notify?: boolean } = {}) {
    const safePackageId = String(packageId).replace(/[^A-Za-z0-9_-]/g, "");
    return this.upload("data", `${DEFAULT_UPLOAD_DIRECTORY}/persistent/${safePackageId}/${normalizeDataPath(path)}`, file, body, options);
  }

  static async createDirectory(_source: string, target: string, _options: object = {}): Promise<string> {
    const response = await fetch("/api/files/directory", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: normalizeDataPath(target) }),
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
    return ((await response.json()) as { path: string }).path;
  }

  /** Removes files or folders under uploads; returns the paths that were erased. */
  static async delete(paths: readonly string[], { notify = true }: { notify?: boolean } = {}): Promise<string[]> {
    const normalized = [...new Set(paths.map((path) => normalizeDataPath(path)).filter((path) => path.length > 0))];
    if (normalized.length === 0) return [];
    const deleted = await this.#deletePathsRequest(normalized);
    if (notify && deleted.length) currentUi()?.notifications?.info(deleted.length === 1 ? "1 arquivo apagado." : `${deleted.length} arquivos apagados.`);
    if (deleted.length < normalized.length && notify) {
      currentUi()?.notifications?.warn(`${normalized.length - deleted.length} arquivo(s) não puderam ser apagados.`);
    }
    return deleted;
  }

  static async #deletePathsRequest(paths: readonly string[]): Promise<string[]> {
    const response = await fetch("/api/files/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [...paths] }),
    });
    if (response.ok) return ((await response.json()) as { deleted: string[] }).deleted;
    const message = await readErrorMessage(response);
    if (paths.length === 1) throw new Error(message);
    // Batch rejected (old server or bad payload): erase one by one with the same endpoint.
    const deleted: string[] = [];
    for (const path of paths) {
      try {
        deleted.push(...(await this.#deletePathsRequest([path])));
      } catch {
        /* keep going so the rest still disappear */
      }
    }
    if (deleted.length === 0) throw new Error(message);
    return deleted;
  }

  /** Shares one of the user's own folders with the whole group, or makes it private again. */
  static async setFolderShared(target: string, shared: boolean): Promise<void> {
    const response = await fetch("/api/files/share", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: normalizeDataPath(target), shared }),
    });
    if (!response.ok) throw new Error(await readErrorMessage(response));
  }

  static fromButton(button: HTMLElement): FilePicker {
    const form = (button as HTMLButtonElement).form ?? button.closest("form");
    const fieldName = button.dataset.target;
    const field = fieldName ? form?.querySelector<HTMLInputElement>(`[name="${CSS.escape(fieldName)}"]`) ?? null : null;
    return new this.implementation({ field, button, type: (button.dataset.type as FilePickerType) ?? "any", current: field?.value ?? "" });
  }

  readonly type: FilePickerType;
  readonly field: HTMLInputElement | null;
  readonly button: HTMLElement | null;
  readonly callback: FilePickerOptions["callback"];
  readonly activeSource = "data";
  readonly browseOnly: boolean;
  request: string;
  target: string;
  result: FilePickerBrowseResult | null = null;
  selectedPath: string;

  constructor(options: FilePickerOptions = {}) {
    const { type, current, callback, field, button, browseOnly, ...applicationOptions } = options;
    super(applicationOptions);
    this.browseOnly = browseOnly === true;
    this.type = type && (type in EXTENSIONS_BY_TYPE || type === "folder" || type === "any") ? type : "any";
    this.field = field ?? null;
    this.button = button ?? null;
    this.callback = callback;
    this.request = normalizeDataPath(current);
    this.selectedPath = this.request;
    this.target = this.#initialDirectory();
  }

  get sources() {
    return { data: { target: this.target, label: "Dados", icon: "fa-solid fa-database" } };
  }

  get extensions(): string[] | undefined {
    const extensions = EXTENSIONS_BY_TYPE[this.type];
    return extensions ? [...extensions] : undefined;
  }

  get canUpload(): boolean {
    const user = (globalThis as { game?: any }).game?.user;
    return Boolean(this.result?.writable) && (user?.isGM || user?.can?.("FILES_UPLOAD") !== false);
  }

  async browse(target: string = this.target): Promise<FilePickerBrowseResult | null> {
    try {
      this.result = await FilePicker.browse("data", target, { extensions: this.extensions });
      this.target = this.result.target;
      FilePicker.LAST_BROWSED_DIRECTORY.value = this.target || DEFAULT_UPLOAD_DIRECTORY;
    } catch (error) {
      currentUi()?.notifications?.warn(error instanceof Error ? error.message : "Pasta indisponível");
      if (!this.result) this.result = await FilePicker.browse("data", DEFAULT_UPLOAD_DIRECTORY, { extensions: this.extensions });
    }
    await this.render({ force: true });
    return this.result;
  }

  override async _prepareContext(_options: RenderOptions): Promise<Record<string, unknown>> {
    if (!this.result) this.result = await FilePicker.browse("data", this.target, { extensions: this.extensions }).catch(() => FilePicker.browse("data", DEFAULT_UPLOAD_DIRECTORY));
    this.target = this.result.target;
    return { result: this.result };
  }

  override async _renderHTML(): Promise<HTMLElement> {
    const model: FilePickerViewModel = {
      result: this.result as FilePickerBrowseResult,
      selectedPath: this.selectedPath,
      type: this.type,
      canUpload: this.canUpload,
      browseOnly: this.browseOnly,
      toUrl: dataPathToUrl,
    };
    return createFilePickerView(model, {
      navigate: (path) => void this.browse(path),
      select: (path) => this.#select(path),
      confirm: (path) => {
        this.selectedPath = path;
        if (this.browseOnly) this.#openFile(path);
        else void this._onSubmit(new Event("submit"));
      },
      upload: (files) => void this.#uploadFiles(files),
      uploadRelative: (files) => void this.#uploadRelative(relativeUploadsFromFileList(files)),
      uploadDataTransfer: (dataTransfer) => void relativeUploadsFromDataTransfer(dataTransfer).then((uploads) => this.#uploadRelative(uploads)),
      createFolder: (name) => void this.#createFolder(name),
      deletePaths: (paths) => void this.#deletePaths(paths),
      share: (path, shared) => void this.#share(path, shared),
      createNote: () => this.#openNoteEditor(),
    });
  }

  #openFile(path: string): void {
    if (NOTE_FILE_PATTERN.test(path)) {
      this.#openNoteEditor(path);
      return;
    }
    window.open(dataPathToUrl(path), "_blank", "noopener");
  }

  #openNoteEditor(path?: string): void {
    const editor = new NoteFileEditor({
      path,
      folder: this.target,
      onSaved: async (saved) => {
        await this.browse(this.target);
        this.#select(saved);
      },
    });
    void editor.render({ force: true }).catch((error: unknown) => {
      currentUi()?.notifications?.error(error instanceof Error ? error.message : "Não foi possível abrir a nota");
    });
  }

  async #share(path: string, shared: boolean): Promise<void> {
    try {
      await FilePicker.setFolderShared(path, shared);
      currentUi()?.notifications?.info(shared ? "Pasta visível para todo o grupo." : "Pasta visível só para você (e o mestre).");
      await this.browse(this.target);
    } catch (error) {
      currentUi()?.notifications?.error(error instanceof Error ? error.message : "Não foi possível mudar quem vê a pasta");
    }
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    content.replaceChildren(result as HTMLElement);
  }

  #initialDirectory(): string {
    if (this.request) {
      const isFile = /\.[A-Za-z0-9]{2,5}$/.test(this.request);
      return isFile ? this.request.split("/").slice(0, -1).join("/") : this.request;
    }
    return FilePicker.LAST_BROWSED_DIRECTORY.value;
  }

  #select(path: string): void {
    this.selectedPath = path;
    this.element?.querySelectorAll<HTMLElement>("[data-file-path]").forEach((entry) => entry.classList.toggle("selected", entry.dataset.filePath === path));
    const input = this.element?.querySelector<HTMLInputElement>("input[name='file-picker-selection']");
    if (input) input.value = path;
  }

  /** Confirms the current selection; public so packages can wrap the submit step. */
  async _onSubmit(_event?: Event): Promise<void> {
    await this.#confirm(this.selectedPath ?? "");
  }

  async #confirm(path: string): Promise<void> {
    const chosen = normalizeDataPath(path || (this.type === "folder" ? this.target : ""));
    if (!chosen) {
      currentUi()?.notifications?.warn("Escolha um arquivo primeiro.");
      return;
    }
    if (this.field) {
      this.field.value = chosen;
      this.field.dispatchEvent(new Event("input", { bubbles: true }));
      this.field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await this.callback?.(chosen, this);
    await this.close();
  }

  async #uploadFiles(files: readonly File[]): Promise<void> {
    await this.#uploadRelative(files.map((file) => ({ file, relativeDir: "" })));
  }

  /** Uploads files into the current folder, recreating relative subfolders like Windows Explorer. */
  async #uploadRelative(uploads: RelativeUpload[]): Promise<void> {
    const { uploads: trimmed, truncated } = trimFolderUpload(uploads);
    if (trimmed.length === 0) return;
    if (truncated) currentUi()?.notifications?.warn(`Só os primeiros ${MAX_FOLDER_UPLOAD_FILES} arquivos serão enviados.`);
    const dirs = new Set(trimmed.map((entry) => entry.relativeDir).filter(Boolean));
    for (const relativeDir of [...dirs].sort((left, right) => left.split("/").length - right.split("/").length)) {
      try {
        await FilePicker.createDirectory("data", joinUploadFolder(this.target, relativeDir));
      } catch {
        /* parent may already exist */
      }
    }
    let stored = 0;
    let lastUploaded: string | null = null;
    for (const { file, relativeDir } of trimmed) {
      const response = await FilePicker.implementation.upload("data", joinUploadFolder(this.target, relativeDir), file, {}, { notify: false });
      if (!response || typeof response !== "object") continue;
      stored += 1;
      lastUploaded = response.path;
    }
    if (stored < trimmed.length) currentUi()?.notifications?.warn(`${trimmed.length - stored} arquivo(s) não foram enviados.`);
    else if (stored) currentUi()?.notifications?.info(stored === 1 ? "1 arquivo enviado." : `${stored} arquivos enviados.`);
    await this.browse(this.target);
    if (lastUploaded) this.#select(lastUploaded);
  }

  async #deletePaths(paths: readonly string[]): Promise<void> {
    const targets = paths.length > 0 ? [...paths] : this.selectedPath ? [this.selectedPath] : [];
    const deletable = targets.filter((path) => path && path !== this.target && path.startsWith("uploads/"));
    if (deletable.length === 0) {
      currentUi()?.notifications?.warn("Selecione um arquivo ou pasta para apagar.");
      return;
    }
    const label = deletable.length === 1 ? deletable[0]!.split("/").pop() : `${deletable.length} itens`;
    const confirmed = await DialogV2.confirm({
      window: { title: "Apagar" },
      content: `<p>Apagar <strong>${label}</strong>? Isso não pode ser desfeito.</p>`,
      yes: { label: "Apagar", icon: "fa-solid fa-trash" },
      no: { label: "Cancelar" },
    });
    if (confirmed !== true) return;
    try {
      const deleted = await FilePicker.delete(deletable);
      if (deleted.includes(this.selectedPath)) this.selectedPath = "";
      await this.browse(this.target);
    } catch {
      /* FilePicker.delete already notifies */
    }
  }

  async #createFolder(name: string): Promise<void> {
    let folderName = name.trim().replace(/[\\/]+/g, "-");
    if (!folderName) {
      const typed = await DialogV2.prompt({
        window: { title: "Nova pasta" },
        content: `<p>Nome da pasta dentro de <code>${this.target || "uploads"}</code>:</p><input type="text" name="folder" maxlength="60" placeholder="Ex.: Mapas" style="width:100%">`,
        ok: {
          label: "Criar",
          icon: "fa-solid fa-folder-plus",
          callback: (_event: Event, button: HTMLButtonElement) => {
            const input = button.form?.querySelector<HTMLInputElement>("input[name='folder']");
            return input?.value?.trim() ?? "";
          },
        },
      });
      folderName = String(typed ?? "").trim().replace(/[\\/]+/g, "-");
    }
    if (!folderName) {
      currentUi()?.notifications?.warn("Digite um nome para a pasta.");
      return;
    }
    if (!this.canUpload) {
      currentUi()?.notifications?.warn("Não dá para criar pasta aqui. Abra a Pasta do mestre ou Uploads.");
      return;
    }
    const parent = this.target && this.target.startsWith("uploads") ? this.target : "uploads/compartilhado";
    try {
      const created = await FilePicker.createDirectory("data", `${parent}/${folderName}`);
      currentUi()?.notifications?.info(`Pasta "${folderName}" criada.`);
      await this.browse(created);
    } catch (error) {
      currentUi()?.notifications?.error(error instanceof Error ? error.message : "Não foi possível criar a pasta");
    }
  }
}
