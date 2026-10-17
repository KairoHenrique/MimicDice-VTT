import type { RpgEntry, RpgFolderListing } from "@tabbletop/protocol";
import { ApiError } from "../net/apiClient";
import { h } from "../views/dom";
import { confirmDanger, pickFolder, promptName } from "./dialogs";
import { buildEntryCard, pathsFromDataTransfer, ENTRY_DRAG_TYPE, ENTRY_DRAG_PATHS_TYPE, type EntryCardHandlers } from "./entryCards";
import { fileUrl, rpgsApi } from "./rpgsApi";
import { PreviewPanel } from "./PreviewPanel";
import { installSelectionMarquee } from "./selectionMarquee";
import { showToast } from "./toasts";
import { UploadQueue } from "./UploadQueue";

const VIEW_MODE_KEY = "tabbletop.rpgs.viewMode";
type ViewMode = "grid" | "list";
type ClipboardMode = "cut" | "copy";

function parentOf(entryPath: string): string {
  return entryPath.split("/").slice(0, -1).join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Algo deu errado";
}

/** The GM's file manager for `rpgs/<world>`: browse, upload, preview, multi-select, cut/copy/paste, move and delete. */
export class FileManagerPage {
  #listing: RpgFolderListing | null = null;
  #currentPath = "";
  #selected = new Set<string>();
  #selectionAnchor: string | null = null;
  #clipboard: { mode: ClipboardMode; paths: string[] } | null = null;
  #filter = "";
  #viewMode: ViewMode = localStorage.getItem(VIEW_MODE_KEY) === "list" ? "list" : "grid";
  #contextMenu: HTMLElement | null = null;
  #disposeMarquee: (() => void) | null = null;

  readonly #breadcrumb = h("nav", { class: "breadcrumb", "aria-label": "Caminho" });
  readonly #grid = h("ul", { class: "entry-grid" });
  readonly #summary = h("span", { class: "folder-summary" });
  readonly #selectionSummary = h("span", { class: "selection-summary" });
  readonly #worldTitle = h("span", { class: "world-name" });
  readonly #dropOverlay = h("div", { class: "drop-overlay", hidden: true }, h("i", { class: "fa-solid fa-cloud-arrow-up" }), h("p", {}, "Solte para enviar para esta pasta"));
  readonly #preview = new PreviewPanel({
    onRename: (entry) => void this.#rename(entry),
    onMove: (entry) => void this.#move([entry.path]),
    onDelete: (entry) => void this.#deletePaths([entry.path]),
    onError: (message) => showToast(message, "error"),
    onInfo: (message) => showToast(message),
  });
  readonly #uploads = new UploadQueue((failures) => {
    if (failures.length > 0) showToast(`${failures.length} arquivo(s) falharam: ${failures[0]}`, "error");
    else showToast("Envio concluído");
    void this.refresh();
  });

  mount(root: HTMLElement): void {
    const main = h("main", { class: "content" }, h("div", { class: "content-toolbar" }, this.#breadcrumb, this.#summary, this.#selectionSummary), this.#grid, this.#dropOverlay);
    root.replaceChildren(this.#buildTopBar(), h("div", { class: "workspace" }, main, this.#preview.element), this.#uploads.element);
    this.#bindPageDrop(main);
    this.#bindKeyboard();
    this.#disposeMarquee = installSelectionMarquee({
      container: this.#grid,
      itemSelector: ".entry-card",
      onComplete: (paths, additive) => this.#applyMarquee(paths, additive),
    });
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
    this.#selected.clear();
    this.#selectionAnchor = null;
    this.#preview.clear();
    if (pushHistory) history.pushState(null, "", this.#currentPath ? `?pasta=${encodeURIComponent(this.#currentPath)}` : location.pathname);
    this.#render();
  }

  async refresh(): Promise<void> {
    const selected = [...this.#selected];
    await this.navigate(this.#currentPath, false);
    const alive = new Set((this.#listing?.entries ?? []).map((entry) => entry.path));
    this.#selected = new Set(selected.filter((path) => alive.has(path)));
    this.#renderEntries();
    const focus = this.#selectedEntries()[0];
    if (focus) void this.#preview.show(focus);
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
      h("div", { class: "brand" }, h("i", { class: "fa-solid fa-dungeon" }), h("div", {}, h("h1", {}, "Arquivos da campanha"), this.#worldTitle)),
      h(
        "div",
        { class: "top-actions" },
        search,
        viewToggle,
        button("fa-solid fa-scissors", "Cortar", () => this.#cutSelection()),
        button("fa-solid fa-copy", "Copiar", () => this.#copySelection()),
        button("fa-solid fa-paste", "Colar", () => void this.#paste()),
        button("fa-solid fa-trash", "Apagar", () => void this.#deleteSelection(), "danger"),
        button("fa-solid fa-folder-plus", "Nova pasta", () => void this.#createFolder()),
        button("fa-solid fa-file-pen", "Nova nota", () => void this.#createNote()),
        button("fa-solid fa-upload", "Enviar arquivos", () => fileInput.click(), "primary"),
        fileInput,
      ),
      h("p", { class: "hint files-shared-hint" }, "Isto é a pasta da campanha no disco. A pasta compartilhada com os jogadores na sessão fica no botão ", h("strong", {}, "Pasta do mestre"), " na mesa."),
      h("a", { class: "back-link", href: "/", title: "Voltar para a mesa" }, h("i", { class: "fa-solid fa-dice-d20" }), " Voltar à mesa"),
    );
  }

  #render(): void {
    if (!this.#listing) return;
    this.#worldTitle.textContent = `Mundo: ${this.#listing.worldTitle}  ·  pasta no disco: rpgs/${this.#listing.rootName}`;
    document.title = `Arquivos · ${this.#listing.worldTitle}`;
    this.#renderBreadcrumb();
    this.#renderEntries();
  }

  #renderBreadcrumb(): void {
    const segments = this.#currentPath ? this.#currentPath.split("/") : [];
    const crumbs: HTMLElement[] = [this.#crumb(this.#listing?.worldTitle || this.#listing?.rootName || "rpgs", "", "fa-solid fa-house")];
    segments.forEach((segment, index) => {
      crumbs.push(h("i", { class: "fa-solid fa-chevron-right separator", "aria-hidden": "true" }), this.#crumb(segment, segments.slice(0, index + 1).join("/")));
    });
    this.#breadcrumb.replaceChildren(...crumbs);
  }

  #crumb(label: string, targetPath: string, icon?: string): HTMLElement {
    const crumb = h("button", { type: "button", class: "crumb" }, icon ? h("i", { class: icon }) : null, ` ${label}`);
    crumb.addEventListener("click", () => void this.navigate(targetPath));
    crumb.addEventListener("dragover", (event) => {
      const types = event.dataTransfer?.types ?? [];
      if (!types.includes(ENTRY_DRAG_TYPE) && !types.includes(ENTRY_DRAG_PATHS_TYPE)) return;
      event.preventDefault();
      crumb.classList.add("drop-target");
    });
    crumb.addEventListener("dragleave", () => crumb.classList.remove("drop-target"));
    crumb.addEventListener("drop", (event) => {
      event.preventDefault();
      crumb.classList.remove("drop-target");
      if (event.dataTransfer) void this.#movePaths(pathsFromDataTransfer(event.dataTransfer), targetPath);
    });
    return crumb;
  }

  #visibleEntries(): RpgEntry[] {
    return (this.#listing?.entries ?? []).filter((entry) => !this.#filter || entry.name.toLowerCase().includes(this.#filter));
  }

  #renderEntries(): void {
    const entries = this.#visibleEntries();
    this.#grid.className = `entry-grid ${this.#viewMode}`;
    const folders = entries.filter((entry) => entry.kind === "folder").length;
    this.#summary.textContent = `${folders} pasta(s) · ${entries.length - folders} arquivo(s)`;
    this.#selectionSummary.textContent = this.#selected.size ? `${this.#selected.size} selecionado(s)` : "";
    if (entries.length === 0) {
      const message = this.#filter ? "Nada encontrado com esse filtro." : "Pasta vazia. Arraste arquivos para cá ou use \"Enviar arquivos\".";
      this.#grid.replaceChildren(h("li", { class: "empty-state" }, h("i", { class: "fa-regular fa-folder-open" }), h("p", {}, message)));
      return;
    }
    const handlers = this.#cardHandlers();
    this.#grid.replaceChildren(...entries.map((entry) => buildEntryCard(entry, this.#selected.has(entry.path), handlers)));
    for (const card of this.#grid.querySelectorAll<HTMLElement>(".entry-card")) {
      card.classList.toggle("cut", this.#clipboard?.mode === "cut" && this.#clipboard.paths.includes(card.dataset.path ?? ""));
    }
  }

  #cardHandlers(): EntryCardHandlers {
    return {
      onSelect: (entry, event) => this.#selectWithModifiers(entry, event),
      onOpen: (entry) => (entry.kind === "folder" ? void this.navigate(entry.path) : void this.#preview.show(entry)),
      onContextMenu: (entry, event) => this.#openContextMenu(entry, event),
      onDropIntoFolder: (folder, dataTransfer) => {
        const paths = pathsFromDataTransfer(dataTransfer);
        if (paths.length) void this.#movePaths(paths, folder.path);
        else if (dataTransfer.files.length > 0) this.#uploads.enqueue(dataTransfer.files, folder.path);
      },
      isSelected: (path) => this.#selected.has(path),
      dragPaths: (entry) => (this.#selected.has(entry.path) && this.#selected.size > 0 ? [...this.#selected] : [entry.path]),
    };
  }

  #selectWithModifiers(entry: RpgEntry, event: MouseEvent): void {
    const visible = this.#visibleEntries().map((item) => item.path);
    if (event.shiftKey && this.#selectionAnchor) {
      const from = visible.indexOf(this.#selectionAnchor);
      const to = visible.indexOf(entry.path);
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from];
        if (!(event.ctrlKey || event.metaKey)) this.#selected.clear();
        for (let index = start; index <= end; index++) this.#selected.add(visible[index]!);
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (this.#selected.has(entry.path)) this.#selected.delete(entry.path);
      else this.#selected.add(entry.path);
      this.#selectionAnchor = entry.path;
    } else {
      this.#selected.clear();
      this.#selected.add(entry.path);
      this.#selectionAnchor = entry.path;
    }
    this.#syncSelectionUi();
    const focus = this.#listing?.entries.find((item) => item.path === entry.path);
    if (focus && focus.kind === "file") void this.#preview.show(focus);
    else if (this.#selected.size === 0) this.#preview.clear();
  }

  #applyMarquee(paths: string[], additive: boolean): void {
    if (!additive) this.#selected.clear();
    for (const path of paths) this.#selected.add(path);
    if (paths.length) this.#selectionAnchor = paths[paths.length - 1] ?? null;
    this.#syncSelectionUi();
  }

  #syncSelectionUi(): void {
    for (const card of this.#grid.querySelectorAll<HTMLElement>(".entry-card")) {
      const path = card.dataset.path ?? "";
      card.classList.toggle("selected", this.#selected.has(path));
      card.setAttribute("aria-selected", this.#selected.has(path) ? "true" : "false");
    }
    this.#selectionSummary.textContent = this.#selected.size ? `${this.#selected.size} selecionado(s)` : "";
  }

  #selectedEntries(): RpgEntry[] {
    return (this.#listing?.entries ?? []).filter((entry) => this.#selected.has(entry.path));
  }

  #openContextMenu(entry: RpgEntry, event: MouseEvent): void {
    this.#closeContextMenu();
    const paths = this.#selected.has(entry.path) ? [...this.#selected] : [entry.path];
    const item = (icon: string, label: string, onClick: () => void, className = "") => {
      const button = h("button", { type: "button", class: className }, h("i", { class: icon }), ` ${label}`);
      button.addEventListener("click", () => {
        this.#closeContextMenu();
        onClick();
      });
      return button;
    };
    const menu = h("div", { class: "context-menu", role: "menu" });
    if (paths.length === 1) {
      menu.append(item(entry.kind === "folder" ? "fa-solid fa-folder-open" : "fa-solid fa-eye", "Abrir", () => this.#cardHandlers().onOpen(entry)));
      if (entry.kind === "file") menu.append(item("fa-solid fa-download", "Baixar", () => window.open(fileUrl(entry.path, true), "_self")));
      menu.append(item("fa-solid fa-pen", "Renomear", () => void this.#rename(entry)));
    }
    menu.append(
      item("fa-solid fa-scissors", "Cortar", () => this.#cutPaths(paths)),
      item("fa-solid fa-copy", "Copiar", () => this.#copyPaths(paths)),
      item("fa-solid fa-folder-tree", paths.length === 1 ? "Mover para..." : `Mover ${paths.length} itens...`, () => void this.#move(paths)),
      item("fa-solid fa-trash", paths.length === 1 ? "Apagar" : `Apagar ${paths.length} itens`, () => void this.#deletePaths(paths), "danger"),
    );
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 280)}px`;
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
    this.#selected = new Set([notePath]);
    const entry = this.#selectedEntries()[0];
    if (entry) void this.#preview.show(entry);
  }

  async #rename(entry: RpgEntry): Promise<void> {
    const name = await promptName(`Renomear "${entry.name}"`, entry.name);
    if (!name || name === entry.name) return;
    await this.#runAction(async () => {
      this.#selected = new Set([(await rpgsApi.rename(entry.path, name)).path]);
    }, "Renomeado");
  }

  async #move(paths: string[]): Promise<void> {
    try {
      const blocked = paths.filter((path) => this.#listing?.entries.find((entry) => entry.path === path)?.kind === "folder");
      const destination = await pickFolder(await rpgsApi.tree(), this.#listing?.rootName ?? "rpgs", blocked[0] ?? "\u0000");
      if (destination !== null) await this.#movePaths(paths, destination);
    } catch (error) {
      showToast(errorMessage(error), "error");
    }
  }

  async #movePaths(paths: string[], destinationFolder: string): Promise<void> {
    const targets = paths.filter((path) => parentOf(path) !== destinationFolder && path !== destinationFolder);
    if (targets.length === 0) return;
    await this.#runAction(async () => {
      for (const path of targets) await rpgsApi.move(path, destinationFolder);
      this.#selected.clear();
    }, targets.length === 1 ? "Movido" : `${targets.length} itens movidos`);
  }

  #cutSelection(): void {
    this.#cutPaths([...this.#selected]);
  }

  #copySelection(): void {
    this.#copyPaths([...this.#selected]);
  }

  #cutPaths(paths: string[]): void {
    if (paths.length === 0) {
      showToast("Selecione algo para cortar", "error");
      return;
    }
    this.#clipboard = { mode: "cut", paths: [...paths] };
    this.#renderEntries();
    showToast(paths.length === 1 ? "Cortado. Vá à pasta e cole." : `${paths.length} itens cortados. Vá à pasta e cole.`);
  }

  #copyPaths(paths: string[]): void {
    if (paths.length === 0) {
      showToast("Selecione algo para copiar", "error");
      return;
    }
    this.#clipboard = { mode: "copy", paths: [...paths] };
    this.#renderEntries();
    showToast(paths.length === 1 ? "Copiado. Vá à pasta e cole." : `${paths.length} itens copiados. Vá à pasta e cole.`);
  }

  async #paste(): Promise<void> {
    if (!this.#clipboard?.paths.length) {
      showToast("Nada na área de transferência", "error");
      return;
    }
    const { mode, paths } = this.#clipboard;
    await this.#runAction(async () => {
      for (const path of paths) {
        if (mode === "cut") await rpgsApi.move(path, this.#currentPath);
        else await rpgsApi.copy(path, this.#currentPath);
      }
      if (mode === "cut") this.#clipboard = null;
    }, mode === "cut" ? "Colado (movido)" : "Colado (copiado)");
  }

  async #deleteSelection(): Promise<void> {
    await this.#deletePaths([...this.#selected]);
  }

  async #deletePaths(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      showToast("Selecione algo para apagar", "error");
      return;
    }
    const entries = (this.#listing?.entries ?? []).filter((entry) => paths.includes(entry.path));
    const label =
      paths.length === 1
        ? entries[0]?.kind === "folder"
          ? `a pasta "${entries[0].name}" e tudo dentro dela`
          : `o arquivo "${entries[0]?.name ?? paths[0]}"`
        : `${paths.length} itens selecionados`;
    if (!(await confirmDanger("Apagar", `Apagar ${label}? Isso não pode ser desfeito.`))) return;
    await this.#runAction(async () => {
      await rpgsApi.removeMany(paths);
      this.#selected.clear();
      this.#preview.clear();
    }, paths.length === 1 ? "Apagado" : `${paths.length} itens apagados`);
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
      const control = event.ctrlKey || event.metaKey;
      if (event.key === "Delete") void this.#deleteSelection();
      else if (control && event.key.toLowerCase() === "a") {
        event.preventDefault();
        for (const entry of this.#visibleEntries()) this.#selected.add(entry.path);
        this.#syncSelectionUi();
      } else if (control && event.key.toLowerCase() === "x") {
        event.preventDefault();
        this.#cutSelection();
      } else if (control && event.key.toLowerCase() === "c") {
        event.preventDefault();
        this.#copySelection();
      } else if (control && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void this.#paste();
      } else if (event.key === "F2" && this.#selected.size === 1) {
        event.preventDefault();
        const entry = this.#selectedEntries()[0];
        if (entry) void this.#rename(entry);
      } else if (event.key === "Backspace" && this.#currentPath) void this.navigate(parentOf(this.#currentPath));
      else if (event.key === "Escape") {
        this.#closeContextMenu();
        this.#selected.clear();
        this.#syncSelectionUi();
        this.#preview.clear();
      }
    });
  }
}
