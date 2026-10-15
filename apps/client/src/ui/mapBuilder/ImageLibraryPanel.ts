import { DialogV2, FilePicker, placeImageTile, type ImageTilePlacement } from "@tabbletop/api";
import { h } from "../../views/dom";
import { FloatingPanelPosition } from "../common/floatingPanel";
import { MAX_FOLDER_UPLOAD_FILES, relativeUploadsFromDataTransfer, relativeUploadsFromFileList, trimFolderUpload, type RelativeUpload } from "./folderUpload";
import { categoryOf, categoryLabel, DEFAULT_LIBRARY_FOLDER, LIBRARY_CATEGORIES, LIBRARY_ROOT } from "./libraryCategories";
import { categoryTabs, IMAGE_FILE_PATTERN, libraryGrid, selectablePaths, VIDEO_FILE_PATTERN, type LibraryListing, type LibraryViewHandlers } from "./imageLibraryView";
import { forgetDpi, rememberDpi, rememberedDpi } from "./tileDpi";
import { askTileDpi } from "./tileUploadDialog";

const PANEL_ID = "image-library-panel";
const FOLDER_KEY = "mimicdice.imageLibrary.folder";
const SCALE_KEY = "mimicdice.imageLibrary.pixelsPerSquare";
const OPEN_KEY = "mimicdice.imageLibrary.open";
const MAX_PIXELS_PER_SQUARE = 4096;
const LIBRARY_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".webm", ".mp4", ".m4v"];

const PANEL_WIDTH_PX = 360;

/** Starts just left of the sidebar so it does not cover the chat. */
function besideSidebar(): { left: number; top: number } {
  const sidebarLeft = document.getElementById("sidebar")?.getBoundingClientRect().left ?? window.innerWidth;
  return { left: Math.max(8, sidebarLeft - PANEL_WIDTH_PX - 16), top: 64 };
}

const panelPosition = new FloatingPanelPosition("mimicdice.imageLibrary.position", besideSidebar);

function storedPixelsPerSquare(): number | undefined {
  const value = Number(localStorage.getItem(SCALE_KEY));
  return Number.isFinite(value) && value > 0 && value <= MAX_PIXELS_PER_SQUARE ? value : undefined;
}

export function isLibraryFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/") || IMAGE_FILE_PATTERN.test(file.name) || VIDEO_FILE_PATTERN.test(file.name);
}

function joinFolder(base: string, relativeDir: string): string {
  if (!relativeDir) return base;
  return `${base.replace(/\/+$/, "")}/${relativeDir.replace(/^\/+|\/+$/g, "")}`;
}

/** GM panel with Mapas / Personagens / Props; images are dragged onto the map to build it piece by piece. */
export class ImageLibraryPanel {
  #element: HTMLElement | null = null;
  #listing: LibraryListing | null = null;
  #filter = "";
  #selected = new Set<string>();
  #selectionAnchor: string | null = null;
  #ensuredCategories = false;

  get open(): boolean {
    return this.#element !== null;
  }

  get folder(): string {
    if (!this.#listing?.writable) return DEFAULT_LIBRARY_FOLDER;
    return categoryOf(this.#listing.folder) ? this.#listing.folder : DEFAULT_LIBRARY_FOLDER;
  }

  /** The image's own DPI (chosen when it was uploaded or resized), otherwise the panel's DPI field. */
  placement(path?: string): ImageTilePlacement {
    const own = path ? rememberedDpi(path) : undefined;
    if (own === null) return {};
    return { pixelsPerSquare: own ?? storedPixelsPerSquare() };
  }

  async setOpen(open: boolean): Promise<void> {
    localStorage.setItem(OPEN_KEY, String(open));
    if (!open || !game.user.isGM) {
      this.#element?.remove();
      this.#element = null;
      return;
    }
    await this.#ensureCategories();
    if (!this.#listing) await this.browse(localStorage.getItem(FOLDER_KEY) ?? DEFAULT_LIBRARY_FOLDER);
    else this.render();
  }

  wasOpen(): boolean {
    return localStorage.getItem(OPEN_KEY) !== "false";
  }

  async browse(folder: string): Promise<void> {
    try {
      const result = await FilePicker.browse("data", folder, { extensions: LIBRARY_EXTENSIONS });
      this.#listing = { folder: result.target, parent: result.parent ?? null, label: result.labels?.[result.target] ?? categoryLabel(result.target), dirs: result.dirs, files: result.files, labels: result.labels ?? {}, writable: result.writable };
      localStorage.setItem(FOLDER_KEY, result.target);
      this.#pruneSelection();
    } catch {
      if (folder !== DEFAULT_LIBRARY_FOLDER) return this.browse(DEFAULT_LIBRARY_FOLDER);
      ui.notifications.warn("Não foi possível abrir a pasta de imagens.");
    }
    this.render();
  }

  /** Asks the DPI of each image, uploads them into the active category (or the chosen one) and remembers size. */
  async upload(files: readonly File[], relativeDirs?: ReadonlyMap<File, string>): Promise<string[]> {
    const images = files.filter(isLibraryFile);
    if (images.length === 0) {
      ui.notifications.warn("Solte imagens (png, jpg, webp, gif, svg) ou vídeos (webm, mp4).");
      return [];
    }
    const active = categoryOf(this.folder);
    const asked = await askTileDpi(images, {
      fallbackDpi: storedPixelsPerSquare(),
      category: active ?? LIBRARY_CATEGORIES[0],
      askCategory: !active,
    });
    if (!asked) return [];
    const destinationRoot = active && this.#listing && categoryOf(this.#listing.folder) ? this.folder : asked.category.path;
    if (!active) await this.browse(destinationRoot);
    return this.#storeUploads(
      images.map((file) => ({ file, relativeDir: relativeDirs?.get(file) ?? "" })),
      asked.dpiByFile,
      destinationRoot,
    );
  }

  async uploadRelative(uploads: RelativeUpload[]): Promise<string[]> {
    const { uploads: trimmed, truncated } = trimFolderUpload(uploads.filter((entry) => isLibraryFile(entry.file)));
    if (trimmed.length === 0) {
      ui.notifications.warn("Solte imagens (png, jpg, webp, gif, svg) ou vídeos (webm, mp4).");
      return [];
    }
    if (truncated) ui.notifications.warn(`Só os primeiros ${MAX_FOLDER_UPLOAD_FILES} arquivos serão enviados.`);
    const relativeDirs = new Map(trimmed.map((entry) => [entry.file, entry.relativeDir]));
    return this.upload(
      trimmed.map((entry) => entry.file),
      relativeDirs,
    );
  }

  async deleteSelected(): Promise<void> {
    if (!game.user.isGM || this.#selected.size === 0) return;
    const paths = [...this.#selected];
    const confirmed = await DialogV2.confirm({
      window: { title: "Apagar da biblioteca" },
      content: h("p", {}, paths.length === 1 ? "Apagar 1 item selecionado? Isso não remove tiles já colocados no mapa." : `Apagar ${paths.length} itens selecionados? Isso não remove tiles já colocados no mapa.`),
      yes: { label: "Apagar", icon: "fa-solid fa-trash" },
    });
    if (!confirmed) return;
    try {
      const deleted = await FilePicker.delete(paths);
      forgetDpi(deleted);
      this.#selected.clear();
      this.#selectionAnchor = null;
      if (this.#listing) await this.browse(this.#listing.folder);
    } catch {
      /* FilePicker already notifies */
    }
  }

  render(): void {
    if (!game.user.isGM || !this.#listing) return;
    const panel = h(
      "section",
      { id: PANEL_ID, class: "md-imglib-panel", "aria-label": "Biblioteca de imagens" },
      this.#header(),
      categoryTabs(this.#listing.folder, (path) => void this.browse(path)),
      this.#toolbar(this.#listing),
      this.#selectionBar(),
      this.#options(),
      h("div", { class: "md-imglib-body" }, libraryGrid(this.#listing, this.#filter, this.#handlers())),
      this.#hint(),
    );
    this.#acceptFileDrops(panel);
    const scrollTop = this.#element?.querySelector(".md-imglib-body")?.scrollTop ?? 0;
    if (this.#element) this.#element.replaceWith(panel);
    else document.body.append(panel);
    this.#element = panel;
    panelPosition.place(panel);
    const body = panel.querySelector(".md-imglib-body");
    if (body) body.scrollTop = scrollTop;
  }

  async #ensureCategories(): Promise<void> {
    if (this.#ensuredCategories) return;
    this.#ensuredCategories = true;
    for (const category of LIBRARY_CATEGORIES) {
      try {
        await FilePicker.createDirectory("data", category.path);
      } catch {
        /* already exists or not writable yet */
      }
    }
  }

  async #storeUploads(uploads: RelativeUpload[], dpiByFile: Map<File, number | null>, destinationRoot: string): Promise<string[]> {
    const dirs = new Set(uploads.map((entry) => entry.relativeDir).filter(Boolean));
    for (const relativeDir of [...dirs].sort((left, right) => left.split("/").length - right.split("/").length)) {
      try {
        await FilePicker.createDirectory("data", joinFolder(destinationRoot, relativeDir));
      } catch {
        /* parent may already exist */
      }
    }
    const stored: string[] = [];
    for (const { file, relativeDir } of uploads) {
      const target = joinFolder(destinationRoot, relativeDir);
      const result = await FilePicker.upload("data", target, file, {}, { notify: false });
      if (!result || typeof result !== "object") continue;
      rememberDpi(result.path, dpiByFile.get(file) ?? null);
      stored.push(result.path);
    }
    if (stored.length < uploads.length) ui.notifications.warn(`${uploads.length - stored.length} arquivo(s) não foram enviados.`);
    else if (stored.length) ui.notifications.info(stored.length === 1 ? "1 arquivo enviado." : `${stored.length} arquivos enviados.`);
    if (this.#listing && (this.#listing.folder === destinationRoot || this.#listing.folder.startsWith(`${destinationRoot}/`))) await this.browse(this.#listing.folder);
    else await this.browse(destinationRoot);
    return stored;
  }

  #handlers(): LibraryViewHandlers {
    return {
      openFolder: (path) => void this.browse(path),
      placement: (path) => this.placement(path),
      placeAtViewCenter: (path) => {
        const view = canvas.app?.view?.getBoundingClientRect?.();
        if (!view || !canvas.ready) return;
        const center = canvas.stage.toLocal({ x: view.width / 2, y: view.height / 2 });
        void placeImageTile(canvas, path, center, this.placement(path));
      },
      selected: this.#selected,
      isSelected: (path) => this.#selected.has(path),
      toggleSelected: (path, options) => this.#toggleSelected(path, options),
    };
  }

  #toggleSelected(path: string, options?: { exclusive?: boolean; range?: boolean }): void {
    if (!this.#listing) return;
    const paths = selectablePaths(this.#listing, this.#filter);
    if (options?.range && this.#selectionAnchor) {
      const from = paths.indexOf(this.#selectionAnchor);
      const to = paths.indexOf(path);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        if (options.exclusive !== false) this.#selected.clear();
        for (let index = start; index <= end; index++) this.#selected.add(paths[index]!);
        this.render();
        return;
      }
    }
    if (options?.exclusive) {
      this.#selected.clear();
      this.#selected.add(path);
    } else if (this.#selected.has(path)) this.#selected.delete(path);
    else this.#selected.add(path);
    this.#selectionAnchor = path;
    this.render();
  }

  #pruneSelection(): void {
    if (!this.#listing) {
      this.#selected.clear();
      return;
    }
    const alive = new Set([...this.#listing.dirs, ...this.#listing.files]);
    for (const path of [...this.#selected]) if (!alive.has(path)) this.#selected.delete(path);
  }

  #header(): HTMLElement {
    const close = h("button", { type: "button", class: "icon", title: "Fechar biblioteca", "aria-label": "Fechar biblioteca" }, h("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }));
    close.addEventListener("click", () => void this.setOpen(false));
    const header = h("header", { class: "md-imglib-header", title: "Arraste para mover" }, h("i", { class: "fa-solid fa-images", "aria-hidden": "true" }), h("strong", {}, "Biblioteca de imagens"), close);
    panelPosition.enableDragging(header, () => this.#element);
    return header;
  }

  #toolbar(listing: LibraryListing): HTMLElement {
    const up = h("button", { type: "button", class: "icon", title: "Pasta de cima", "aria-label": "Pasta de cima", disabled: listing.parent === null && listing.folder === LIBRARY_ROOT }, h("i", { class: "fa-solid fa-arrow-up", "aria-hidden": "true" }));
    up.addEventListener("click", () => {
      const parent = listing.parent ?? listing.folder.split("/").slice(0, -1).join("/");
      void this.browse(parent || LIBRARY_ROOT);
    });
    const refresh = h("button", { type: "button", class: "icon", title: "Atualizar", "aria-label": "Atualizar" }, h("i", { class: "fa-solid fa-rotate", "aria-hidden": "true" }));
    refresh.addEventListener("click", () => void this.browse(listing.folder));
    const fileInput = h("input", { type: "file", multiple: true, accept: "image/*,video/webm,video/mp4", hidden: true });
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length) void this.upload(Array.from(fileInput.files));
      fileInput.value = "";
    });
    const folderInput = h("input", { type: "file", multiple: true, hidden: true });
    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
    folderInput.addEventListener("change", () => {
      if (folderInput.files?.length) void this.uploadRelative(relativeUploadsFromFileList(folderInput.files));
      folderInput.value = "";
    });
    const upload = h("button", { type: "button", class: "icon", title: "Enviar imagens", "aria-label": "Enviar imagens", disabled: !listing.writable }, h("i", { class: "fa-solid fa-upload", "aria-hidden": "true" }));
    upload.addEventListener("click", () => fileInput.click());
    const uploadFolder = h("button", { type: "button", class: "icon", title: "Enviar pasta", "aria-label": "Enviar pasta", disabled: !listing.writable }, h("i", { class: "fa-solid fa-folder-plus", "aria-hidden": "true" }));
    uploadFolder.addEventListener("click", () => folderInput.click());
    return h("div", { class: "md-imglib-bar" }, up, h("span", { class: "md-imglib-path", title: `/${listing.folder}` }, listing.label), refresh, upload, uploadFolder, fileInput, folderInput);
  }

  #selectionBar(): HTMLElement {
    const count = this.#selected.size;
    const selectAll = h("button", { type: "button", class: "md-imglib-action" }, "Selecionar tudo");
    selectAll.addEventListener("click", () => {
      if (!this.#listing) return;
      for (const path of selectablePaths(this.#listing, this.#filter)) this.#selected.add(path);
      this.render();
    });
    const clear = h("button", { type: "button", class: "md-imglib-action", disabled: count === 0 }, "Limpar");
    clear.addEventListener("click", () => {
      this.#selected.clear();
      this.#selectionAnchor = null;
      this.render();
    });
    const remove = h("button", { type: "button", class: "md-imglib-action md-imglib-action-danger", disabled: count === 0 }, count ? `Excluir (${count})` : "Excluir");
    remove.addEventListener("click", () => void this.deleteSelected());
    return h("div", { class: "md-imglib-selection" }, selectAll, clear, remove);
  }

  #options(): HTMLElement {
    const filter = h("input", { type: "search", value: this.#filter, placeholder: "Filtrar por nome", "aria-label": "Filtrar imagens por nome" });
    filter.addEventListener("input", () => {
      this.#filter = filter.value;
      const body = this.#element?.querySelector(".md-imglib-body");
      if (body && this.#listing) body.replaceChildren(libraryGrid(this.#listing, this.#filter, this.#handlers()));
    });
    const scale = h("input", { type: "number", min: 1, max: MAX_PIXELS_PER_SQUARE, step: 1, value: storedPixelsPerSquare() ?? "", placeholder: "Original", class: "md-imglib-scale", "aria-label": "DPI padrão: pixels da imagem por quadrado" });
    scale.addEventListener("change", () => {
      const value = Math.round(Number(scale.value));
      if (scale.value.trim() === "" || !Number.isFinite(value) || value <= 0) localStorage.removeItem(SCALE_KEY);
      else localStorage.setItem(SCALE_KEY, String(Math.min(value, MAX_PIXELS_PER_SQUARE)));
    });
    const scaleLabel = h("label", { class: "md-imglib-scale-field", title: "DPI padrão: quantos pixels da imagem formam 1 quadrado do mapa. Imagens enviadas com o próprio DPI usam o delas. Vazio: tamanho original." }, "DPI", scale);
    return h("div", { class: "md-imglib-options" }, filter, scaleLabel);
  }

  #hint(): HTMLElement {
    return h("p", { class: "md-imglib-hint hint" }, "Arraste para o mapa (Shift: livre). Envie arquivos ou pastas. Marque várias imagens para excluir.");
  }

  #acceptFileDrops(panel: HTMLElement): void {
    panel.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      panel.classList.add("drop-target");
    });
    panel.addEventListener("dragleave", () => panel.classList.remove("drop-target"));
    panel.addEventListener("drop", (event) => {
      panel.classList.remove("drop-target");
      if (!event.dataTransfer) return;
      event.preventDefault();
      void relativeUploadsFromDataTransfer(event.dataTransfer).then((uploads) => this.uploadRelative(uploads));
    });
  }
}
