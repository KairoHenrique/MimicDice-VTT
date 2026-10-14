import type { RpgEntry, RpgFolderListing } from "@tabbletop/protocol";
import { ApiError } from "../net/apiClient";
import { h } from "../views/dom";
import { confirmDanger, pickFolder, promptName } from "./dialogs";
import { buildEntryCard, ENTRY_DRAG_TYPE, type EntryCardHandlers } from "./entryCards";
import { fileUrl, rpgsApi } from "./rpgsApi";
import { PreviewPanel } from "./PreviewPanel";
import { showToast } from "./toasts";
import { UploadQueue } from "./UploadQueue";

const VIEW_MODE_KEY = "tabbletop.rpgs.viewMode";
type ViewMode = "grid" | "list";

function parentOf(entryPath: string): string {
  return entryPath.split("/").slice(0, -1).join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Algo deu errado";
}

/** The GM's file manager for `rpgs/<world>`: browse, upload, preview, edit text, rename, move and delete. */
export class FileManagerPage {
  #listing: RpgFolderListing | null = null;
  #currentPath = "";
  #selectedPath: string | null = null;
  #filter = "";
  #viewMode: ViewMode = localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
  #contextMenu: HTMLElement | null = null;

  readonly #breadcrumb = h("nav", { class: "breadcrumb", "aria-label": "Caminho" });
  readonly #grid = h("ul", { class: "entry-grid" });
  readonly #summary = h("span", { class: "folder-summary" });
  readonly #worldTitle = h("span", { class: "world-name" });
  readonly #dropOverlay = h("div", { class: "drop-overlay", hidden: true }, h("i", { class: "fa-solid fa-cloud-arrow-up" }), h("p", {}, "Solte para enviar para esta pasta"));
  readonly #preview = new PreviewPanel({
    onRename: (entry) => void this.#rename(entry),
    onMove: (entry) => void this.#move(entry),
    onDelete: (entry) => void this.#delete(entry),
    onError: (message) => showToast(message, "error"),
    onInfo: (message) => showToast(message),
  });
  readonly #uploads = new UploadQueue((failures) => {
    if (failures.length > 0) showToast(`${failures.length} arquivo(s) falharam: ${failures[0]}`, "error");
    else showToast("Envio concluído");
    void this.refresh();
  });

  mount(root: HTMLElement): void {
    const main = h("main", { class: "content" }, h("div", { class: "content-toolbar" }, this.#breadcrumb, this.#summary), this.#grid, this.#dropOverlay);
    root.replaceChildren(this.#buildTopBar(), h("div", { class: "workspace" }, main, this.#preview.element), this.#uploads.element);
    this.#bindPageDrop(main);
    this.#bindKeyboard();
    document.addEventListener("click", () => this.#closeContextMenu());
    window.addEventListener("popstate", () => void this.navigate(new URLSearchParams(location.search).get("pasta") ?? "", false));
    void this.navigate(new URLSearchParams(location.search).get("pasta") ?? "", false);
  }

  async navigate(folderPath: string, pushHistory = true): Promise<void> {
    try {
      this.#listing = await rpgsApi.list(folderPath);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        location.href = "/";
        return;
      }
      showToast(errorMessage(error), "error");
      if (folderPath) return this.navigate("", pushHistory);
      return;
    }
    this.#currentPath = this.#listing.path;
    this.#selectedPath = null;
    this.#preview.clear();
    if (pushHistory) history.pushState(null, "", this.#currentPath ? `?pasta=${encodeURIComponent(this.#currentPath)}` : location.pathname);
    this.#render();
  }

  async refresh(): Promise<void> {
    const selected = this.#selectedPath;
    await this.navigate(this.#currentPath, false);
    const entry = this.#listing?.entries.find((candidate) => candidate.path === selected);
    if (entry) this.#select(entry);
  }

  #buildTopBar(): HTMLElement {
    const fileInput = h("input", { type: "file", multiple: true, hidden: true });
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length) this.#uploads.enqueue(fileInput.files, this.#currentPath);
      fileInput.value = "";
    });
    const button = (icon: string, label: string, onClick: () => void, className = "") => {
      const element = h("button", { type: "button", class: className, title: label }, h("i", { class: icon }), h("span", { class: "label" }, ` ${label}`));
      element.addEventListener("click", onClick);
      return element;
    };
    const search = h("input", { type: "search", placeholder: "Filtrar nesta pasta...", "aria-label": "Filtrar arquivos", class: "search" });
    search.addEventListener("input", () => {
      this.#filter = search.value.trim().toLowerCase();
      this.#renderEntries();
    });
    const viewToggle = button(this.#viewMode === "grid" ? "fa-solid fa-list" : "fa-solid fa-grip", "Modo de exibição", () => {
      this.#viewMode = this.#viewMode === "grid" ? "list" : "grid";
      localStorage.setItem(VIEW_MODE_KEY, this.#viewMode);
      viewToggle.querySelector("i")!.className = this.#viewMode === "grid" ? "fa-solid fa-list" : "fa-solid fa-grip";
      this.#renderEntries();
    }, "icon-only");
    return h(
      "header",
      { class: "top-bar" },
      h("div", { class: "brand" }, h("i", { class: "fa-solid fa-dungeon" }), h("div", {}, h("h1", {}, "Arquivos do Mestre"), this.#worldTitle)),
      h("div", { class: "top-actions" }, search, viewToggle, button("fa-solid fa-folder-plus", "Nova pasta", () => void this.#createFolder()), button("fa-solid fa-file-pen", "Nova nota", () => void this.#createNote()), button("fa-solid fa-upload", "Enviar arquivos", () => fileInput.click(), "primary"), fileInput),
      h("a", { class: "back-link", href: "/", title: "Voltar para a mesa" }, h("i", { class: "fa-solid fa-dice-d20" }), " Voltar à mesa"),
    );
  }

  #render(): void {
    if (!this.#listing) return;
    this.#worldTitle.textContent = `Mundo: ${this.#listing.worldTitle}  ·  pasta rpgs/${this.#listing.rootName}`;
    document.title = `Arquivos · ${this.#listing.worldTitle}`;
    this.#renderBreadcrumb();
    this.#renderEntries();
  }

  #renderBreadcrumb(): void {
    const segments = this.#currentPath ? this.#currentPath.split("/") : [];
    const crumbs: HTMLElement[] = [this.#crumb(this.#listing?.rootName ?? "rpgs", "", "fa-solid fa-house")];
    segments.forEach((segment, index) => {
      crumbs.push(h("i", { class: "fa-solid fa-chevron-right separator", "aria-hidden": "true" }), this.#crumb(segment, segments.slice(0, index + 1).join("/")));
    });
    this.#breadcrumb.replaceChildren(...crumbs);
  }

  #crumb(label: string, targetPath: string, icon?: string): HTMLElement {
    const crumb = h("button", { type: "button", class: "crumb" }, icon ? h("i", { class: icon }) : null, ` ${label}`);
    crumb.addEventListener("click", () => void this.navigate(targetPath));
    crumb.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes(ENTRY_DRAG_TYPE)) return;
      event.preventDefault();
      crumb.classList.add("drop-target");
    });
    crumb.addEventListener("dragleave", () => crumb.classList.remove("drop-target"));
    crumb.addEventListener("drop", (event) => {
      event.preventDefault();
      crumb.classList.remove("drop-target");
      const source = event.dataTransfer?.getData(ENTRY_DRAG_TYPE);
      if (source) void this.#moveTo(source, targetPath);
    });
    return crumb;
  }

  #renderEntries(): void {
    const entries = (this.#listing?.entries ?? []).filter((entry) => !this.#filter || entry.name.toLowerCase().includes(this.#filter));
    this.#grid.className = `entry-grid ${this.#viewMode}`;
    const folders = entries.filter((entry) => entry.kind === "folder").length;
    this.#summary.textContent = `${folders} pasta(s) · ${entries.length - folders} arquivo(s)`;
    if (entries.length === 0) {
      const message = this.#filter ? "Nada encontrado com esse filtro." : "Pasta vazia. Arraste arquivos para cá ou use \"Enviar arquivos\".";
      this.#grid.replaceChildren(h("li", { class: "empty-state" }, h("i", { class: "fa-regular fa-folder-open" }), h("p", {}, message)));
      return;
    }
    const handlers = this.#cardHandlers();
    this.#grid.replaceChildren(...entries.map((entry) => buildEntryCard(entry, entry.path === this.#selectedPath, handlers)));
  }

  #cardHandlers(): EntryCardHandlers {
    return {
      onSelect: (entry) => this.#select(entry),
      onOpen: (entry) => (entry.kind === "folder" ? void this.navigate(entry.path) : void this.#preview.show(entry)),
      onContextMenu: (entry, event) => this.#openContextMenu(entry, event),
      onDropIntoFolder: (folder, dataTransfer) => {
        const source = dataTransfer.getData(ENTRY_DRAG_TYPE);
        if (source) void this.#moveTo(source, folder.path);
        else if (dataTransfer.files.length > 0) this.#uploads.enqueue(dataTransfer.files, folder.path);
      },
    };
  }

  #select(entry: RpgEntry): void {
    this.#selectedPath = entry.path;
    for (const card of this.#grid.querySelectorAll<HTMLElement>(".entry-card")) card.classList.toggle("selected", card.dataset.path === entry.path);
    void this.#preview.show(entry);
  }

  #selectedEntry(): RpgEntry | undefined {
    return this.#listing?.entries.find((entry) => entry.path === this.#selectedPath);
  }

  #openContextMenu(entry: RpgEntry, event: MouseEvent): void {
    this.#closeContextMenu();
    const item = (icon: string, label: string, onClick: () => void, className = "") => {
      const button = h("button", { type: "button", class: className }, h("i", { class: icon }), ` ${label}`);
      button.addEventListener("click", () => {
        this.#closeContextMenu();
        onClick();
      });
      return button;
    };
    const menu = h("div", { class: "context-menu", role: "menu" });
    menu.append(item(entry.kind === "folder" ? "fa-solid fa-folder-open" : "fa-solid fa-eye", "Abrir", () => this.#cardHandlers().onOpen(entry)));
    if (entry.kind === "file") menu.append(item("fa-solid fa-download", "Baixar", () => window.open(fileUrl(entry.path, true), "_self")));
    menu.append(item("fa-solid fa-pen", "Renomear", () => void this.#rename(entry)), item("fa-solid fa-folder-tree", "Mover para...", () => void this.#move(entry)), item("fa-solid fa-trash", "Apagar", () => void this.#delete(entry), "danger"));
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 220)}px`;
    menu.addEventListener("click", (clickEvent) => clickEvent.stopPropagation());
    document.body.append(menu);
    this.#contextMenu = menu;
  }

  #closeContextMenu(): void {
    this.#contextMenu?.remove();
    this.#contextMenu = null;
  }

  async #runAction(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    try {
      await action();
      showToast(successMessage);
      await this.refresh();
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  }

  async #createFolder(): Promise<void> {
    const name = await promptName("Nova pasta", "", "Criar");
    if (name) await this.#runAction(() => rpgsApi.createFolder(this.#currentPath, name), `Pasta "${name}" criada`);
  }

  async #createNote(): Promise<void> {
    const requested = await promptName("Nova nota de texto", "Anotações.md", "Criar");
    if (!requested) return;
    const name = /\.(md|txt)$/i.test(requested) ? requested : `${requested}.md`;
    const notePath = this.#currentPath ? `${this.#currentPath}/${name}` : name;
    if (this.#listing?.entries.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      showToast("Já existe um arquivo com esse nome", "error");
      return;
    }
    await this.#runAction(() => rpgsApi.writeText(notePath, ""), `Nota "${name}" criada`);
    this.#selectedPath = notePath;
    const entry = this.#selectedEntry();
    if (entry) this.#select(entry);
  }

  async #rename(entry: RpgEntry): Promise<void> {
    const name = await promptName(`Renomear "${entry.name}"`, entry.name);
    if (!name || name === entry.name) return;
    await this.#runAction(async () => {
      this.#selectedPath = (await rpgsApi.rename(entry.path, name)).path;
    }, "Renomeado");
  }

  async #move(entry: RpgEntry): Promise<void> {
    try {
      const destination = await pickFolder(await rpgsApi.tree(), this.#listing?.rootName ?? "rpgs", entry.kind === "folder" ? entry.path : "\u0000");
      if (destination !== null) await this.#moveTo(entry.path, destination);
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  }

  async #moveTo(sourcePath: string, destinationFolder: string): Promise<void> {
    if (parentOf(sourcePath) === destinationFolder || sourcePath === destinationFolder) return;
    await this.#runAction(() => rpgsApi.move(sourcePath, destinationFolder), "Movido");
  }

  async #delete(entry: RpgEntry): Promise<void> {
    const what = entry.kind === "folder" ? `a pasta "${entry.name}" e tudo dentro dela` : `o arquivo "${entry.name}"`;
    if (!(await confirmDanger("Apagar", `Apagar ${what}? Isso não pode ser desfeito.`))) return;
    await this.#runAction(async () => {
      await rpgsApi.remove(entry.path);
      this.#selectedPath = null;
      this.#preview.clear();
    }, "Apagado");
  }

  #bindPageDrop(dropZone: HTMLElement): void {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    dropZone.addEventListener("dragenter", (event) => {
      if (!hasFiles(event)) return;
      depth += 1;
      this.#dropOverlay.hidden = false;
    });
    dropZone.addEventListener("dragleave", (event) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) this.#dropOverlay.hidden = true;
    });
    dropZone.addEventListener("dragover", (event) => {
      if (hasFiles(event)) event.preventDefault();
    });
    dropZone.addEventListener("drop", (event) => {
      depth = 0;
      this.#dropOverlay.hidden = true;
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer?.files.length) this.#uploads.enqueue(event.dataTransfer.files, this.#currentPath);
    });
  }

  #bindKeyboard(): void {
    document.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, dialog")) return;
      const entry = this.#selectedEntry();
      if (event.key === "Delete" && entry) void this.#delete(entry);
      else if (event.key === "F2" && entry) {
        event.preventDefault();
        void this.#rename(entry);
      } else if (event.key === "Backspace" && this.#currentPath) void this.navigate(parentOf(this.#currentPath));
      else if (event.key === "Escape") this.#closeContextMenu();
    });
  }
}
