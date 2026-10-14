import { FilePicker, placeImageTile, type ImageTilePlacement } from "@tabbletop/api";
import { h } from "../../views/dom";
import { FloatingPanelPosition } from "../common/floatingPanel";
import { IMAGE_FILE_PATTERN, libraryGrid, VIDEO_FILE_PATTERN, type LibraryListing, type LibraryViewHandlers } from "./imageLibraryView";

const PANEL_ID = "image-library-panel";
const FOLDER_KEY = "mimicdice.imageLibrary.folder";
const SCALE_KEY = "mimicdice.imageLibrary.pixelsPerSquare";
const OPEN_KEY = "mimicdice.imageLibrary.open";
const DEFAULT_FOLDER = "uploads";
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

/** GM panel with the uploaded images of a folder; each one is dragged onto the map to build it piece by piece. */
export class ImageLibraryPanel {
  #element: HTMLElement | null = null;
  #listing: LibraryListing | null = null;
  #filter = "";

  get open(): boolean {
    return this.#element !== null;
  }

  get folder(): string {
    return this.#listing?.writable ? this.#listing.folder : DEFAULT_FOLDER;
  }

  placement(): ImageTilePlacement {
    return { pixelsPerSquare: storedPixelsPerSquare() };
  }

  async setOpen(open: boolean): Promise<void> {
    localStorage.setItem(OPEN_KEY, String(open));
    if (!open || !game.user.isGM) {
      this.#element?.remove();
      this.#element = null;
      return;
    }
    if (!this.#listing) await this.browse(localStorage.getItem(FOLDER_KEY) ?? DEFAULT_FOLDER);
    else this.render();
  }

  wasOpen(): boolean {
    return localStorage.getItem(OPEN_KEY) !== "false";
  }

  async browse(folder: string): Promise<void> {
    try {
      const result = await FilePicker.browse("data", folder, { extensions: LIBRARY_EXTENSIONS });
      this.#listing = { folder: result.target, parent: result.parent ?? null, label: result.labels?.[result.target] ?? `/${result.target}`, dirs: result.dirs, files: result.files, labels: result.labels ?? {}, writable: result.writable };
      localStorage.setItem(FOLDER_KEY, result.target);
    } catch {
      if (folder !== DEFAULT_FOLDER) return this.browse(DEFAULT_FOLDER);
      ui.notifications.warn("Não foi possível abrir a pasta de imagens.");
    }
    this.render();
  }

  async upload(files: readonly File[]): Promise<string[]> {
    const images = files.filter(isLibraryFile);
    if (images.length === 0) {
      ui.notifications.warn("Solte imagens (png, jpg, webp, gif, svg) ou vídeos (webm, mp4).");
      return [];
    }
    const folder = this.folder;
    const stored: string[] = [];
    for (const file of images) {
      const result = await FilePicker.upload("data", folder, file, {}, { notify: false });
      if (result && typeof result === "object") stored.push(result.path);
    }
    if (stored.length < images.length) ui.notifications.warn(`${images.length - stored.length} arquivo(s) não foram enviados.`);
    if (this.#listing?.folder === folder) await this.browse(folder);
    return stored;
  }

  render(): void {
    if (!game.user.isGM || !this.#listing) return;
    const panel = h("section", { id: PANEL_ID, class: "md-imglib-panel", "aria-label": "Imagens do mapa" }, this.#header(), this.#toolbar(this.#listing), this.#options(), h("div", { class: "md-imglib-body" }, libraryGrid(this.#listing, this.#filter, this.#handlers())), this.#hint());
    this.#acceptFileDrops(panel);
    const scrollTop = this.#element?.querySelector(".md-imglib-body")?.scrollTop ?? 0;
    if (this.#element) this.#element.replaceWith(panel);
    else document.body.append(panel);
    this.#element = panel;
    panelPosition.place(panel);
    const body = panel.querySelector(".md-imglib-body");
    if (body) body.scrollTop = scrollTop;
  }

  #handlers(): LibraryViewHandlers {
    return {
      openFolder: (path) => void this.browse(path),
      placement: () => this.placement(),
      placeAtViewCenter: (path) => {
        const view = canvas.app?.view?.getBoundingClientRect?.();
        if (!view || !canvas.ready) return;
        const center = canvas.stage.toLocal({ x: view.width / 2, y: view.height / 2 });
        void placeImageTile(canvas, path, center, this.placement());
      },
    };
  }

  #header(): HTMLElement {
    const close = h("button", { type: "button", class: "icon", title: "Fechar imagens", "aria-label": "Fechar imagens" }, h("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }));
    close.addEventListener("click", () => void this.setOpen(false));
    const header = h("header", { class: "md-imglib-header", title: "Arraste para mover" }, h("i", { class: "fa-solid fa-images", "aria-hidden": "true" }), h("strong", {}, "Imagens do mapa"), close);
    panelPosition.enableDragging(header, () => this.#element);
    return header;
  }

  #toolbar(listing: LibraryListing): HTMLElement {
    const up = h("button", { type: "button", class: "icon", title: "Pasta de cima", "aria-label": "Pasta de cima", disabled: listing.parent === null && listing.folder === "" }, h("i", { class: "fa-solid fa-arrow-up", "aria-hidden": "true" }));
    up.addEventListener("click", () => void this.browse(listing.parent ?? listing.folder.split("/").slice(0, -1).join("/")));
    const refresh = h("button", { type: "button", class: "icon", title: "Atualizar", "aria-label": "Atualizar" }, h("i", { class: "fa-solid fa-rotate", "aria-hidden": "true" }));
    refresh.addEventListener("click", () => void this.browse(listing.folder));
    const input = h("input", { type: "file", multiple: true, accept: "image/*,video/webm,video/mp4", hidden: true });
    input.addEventListener("change", () => {
      if (input.files?.length) void this.upload(Array.from(input.files));
    });
    const upload = h("button", { type: "button", class: "icon", title: "Enviar imagens para esta pasta", "aria-label": "Enviar imagens para esta pasta", disabled: !listing.writable }, h("i", { class: "fa-solid fa-upload", "aria-hidden": "true" }));
    upload.addEventListener("click", () => input.click());
    return h("div", { class: "md-imglib-bar" }, up, h("span", { class: "md-imglib-path", title: `/${listing.folder}` }, listing.label), refresh, upload, input);
  }

  #options(): HTMLElement {
    const filter = h("input", { type: "search", value: this.#filter, placeholder: "Filtrar por nome", "aria-label": "Filtrar imagens por nome" });
    filter.addEventListener("input", () => {
      this.#filter = filter.value;
      const body = this.#element?.querySelector(".md-imglib-body");
      if (body && this.#listing) body.replaceChildren(libraryGrid(this.#listing, this.#filter, this.#handlers()));
    });
    const scale = h("input", { type: "number", min: 1, max: MAX_PIXELS_PER_SQUARE, step: 1, value: storedPixelsPerSquare() ?? "", placeholder: "Original", class: "md-imglib-scale", "aria-label": "Pixels da imagem por quadrado" });
    scale.addEventListener("change", () => {
      const value = Math.round(Number(scale.value));
      if (scale.value.trim() === "" || !Number.isFinite(value) || value <= 0) localStorage.removeItem(SCALE_KEY);
      else localStorage.setItem(SCALE_KEY, String(Math.min(value, MAX_PIXELS_PER_SQUARE)));
    });
    const scaleLabel = h("label", { class: "md-imglib-scale-field", title: "Quantos pixels da imagem formam 1 quadrado do mapa. Ex.: peças feitas para grade de 140 px: digite 140. Vazio: tamanho original." }, "px/quadrado", scale);
    return h("div", { class: "md-imglib-options" }, filter, scaleLabel);
  }

  #hint(): HTMLElement {
    return h("p", { class: "md-imglib-hint hint" }, "Arraste para o mapa: encaixa em 1/4 de quadrado (Shift: livre). Arquivos do computador também podem ser soltos aqui ou direto no mapa.");
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
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void this.upload(files);
    });
  }
}
