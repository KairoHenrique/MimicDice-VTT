import { dataPathToUrl, imageTileDragData, type ImageTilePlacement } from "@tabbletop/api";
import { h } from "../../views/dom";
import { LIBRARY_CATEGORIES, LIBRARY_ROOT, categoryOf, type LibraryCategory } from "./libraryCategories";

export const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
export const VIDEO_FILE_PATTERN = /\.(webm|mp4|m4v)$/i;
const MAX_LISTED_FILES = 400;

export interface LibraryListing {
  folder: string;
  parent: string | null;
  label: string;
  dirs: string[];
  files: string[];
  labels: Record<string, string>;
  writable: boolean;
}

export interface LibraryViewHandlers {
  openFolder(path: string): void;
  placeAtViewCenter(path: string): void;
  placement(path: string): ImageTilePlacement;
  selected: ReadonlySet<string>;
  selectWithModifiers(path: string, event: MouseEvent): void;
  isSelected(path: string): boolean;
  onContextMenu(path: string, event: MouseEvent): void;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function folderEntry(path: string, label: string, handlers: LibraryViewHandlers): HTMLElement {
  const selected = handlers.isSelected(path);
  const button = h("button", { type: "button", class: "md-imglib-folder", title: `/${path}` }, h("i", { class: "fa-solid fa-folder", "aria-hidden": "true" }), h("span", { class: "md-imglib-name" }, label));
  button.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      handlers.selectWithModifiers(path, event);
      return;
    }
    handlers.openFolder(path);
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    handlers.onContextMenu(path, event);
  });
  const item = h("li", { class: selected ? "md-imglib-folder-wrap is-selected" : "md-imglib-folder-wrap", "data-path": path }, button);
  return item;
}

function preview(path: string): HTMLElement {
  if (VIDEO_FILE_PATTERN.test(path)) return h("i", { class: "fa-solid fa-film md-imglib-thumb md-imglib-thumb-icon", "aria-hidden": "true" });
  return h("img", { class: "md-imglib-thumb", src: dataPathToUrl(path), alt: "", loading: "lazy", draggable: "false" });
}

function imageEntry(path: string, handlers: LibraryViewHandlers): HTMLElement {
  const name = baseName(path);
  const selected = handlers.isSelected(path);
  const item = h(
    "li",
    {
      class: selected ? "md-imglib-image is-selected" : "md-imglib-image",
      draggable: "true",
      tabIndex: 0,
      "data-path": path,
      title: `${name}\nClique para selecionar. Arraste para o mapa. Delete apaga.`,
      "aria-label": `${name}: clique para selecionar, Enter coloca no centro, Delete apaga`,
      "aria-selected": selected ? "true" : "false",
    },
    preview(path),
    h("span", { class: "md-imglib-name" }, name),
  );
  item.addEventListener("click", (event) => {
    event.preventDefault();
    handlers.selectWithModifiers(path, event);
  });
  item.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    handlers.onContextMenu(path, event);
  });
  item.addEventListener("dragstart", (event) => {
    if (handlers.selected.size > 0 && !handlers.isSelected(path)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData("text/plain", JSON.stringify(imageTileDragData(path, handlers.placement(path))));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    const thumb = item.querySelector("img");
    if (thumb && event.dataTransfer) event.dataTransfer.setDragImage(thumb, thumb.width / 2, thumb.height / 2);
  });
  item.addEventListener("dblclick", (event) => {
    event.preventDefault();
    handlers.placeAtViewCenter(path);
  });
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handlers.placeAtViewCenter(path);
  });
  return item;
}

/** Category tabs plus an Outros entry when browsing outside Mapas / Personagens / Props. */
export function categoryTabs(folder: string, onOpen: (path: string) => void): HTMLElement {
  const active = categoryOf(folder);
  const tabs = LIBRARY_CATEGORIES.map((category) => {
    const pressed = active?.id === category.id;
    const button = h("button", { type: "button", class: "md-imglib-tab", "aria-pressed": pressed ? "true" : "false" }, category.label);
    button.addEventListener("click", () => onOpen(category.path));
    return button;
  });
  if (!active && folder.startsWith(`${LIBRARY_ROOT}/`)) {
    const other = h("button", { type: "button", class: "md-imglib-tab", "aria-pressed": "true" }, "Outros");
    other.addEventListener("click", () => onOpen(LIBRARY_ROOT));
    tabs.push(other);
  }
  return h("div", { class: "md-imglib-tabs", role: "tablist", "aria-label": "Pastas da biblioteca" }, ...tabs);
}

/** Folders first, then the images whose name contains the filter. */
export function libraryGrid(listing: LibraryListing, filter: string, handlers: LibraryViewHandlers): HTMLElement {
  const needle = filter.trim().toLocaleLowerCase("pt-BR");
  const matches = (path: string) => !needle || baseName(path).toLocaleLowerCase("pt-BR").includes(needle);
  const dirs = listing.dirs.filter(matches);
  const files = listing.files.filter((path) => (IMAGE_FILE_PATTERN.test(path) || VIDEO_FILE_PATTERN.test(path)) && matches(path));
  const atUploadsRoot = listing.folder === LIBRARY_ROOT;
  const grid = h(
    "ul",
    { class: "md-imglib-grid", "aria-label": "Imagens da pasta" },
    ...dirs.map((path) => {
      const label = listing.labels[path] ?? baseName(path);
      const category = LIBRARY_CATEGORIES.find((entry) => entry.path === path);
      return folderEntry(path, category?.label ?? label, handlers);
    }),
    ...files.slice(0, MAX_LISTED_FILES).map((path) => imageEntry(path, handlers)),
  );
  if (grid.childElementCount === 0) {
    grid.append(
      h(
        "li",
        { class: "md-imglib-empty" },
        needle ? "Nada com esse nome aqui." : atUploadsRoot ? "Escolha Mapas, Personagens ou Props acima, ou envie imagens." : "Sem imagens nesta pasta. Envie com o botão de upload ou arraste arquivos e pastas do computador para cá.",
      ),
    );
  }
  if (files.length > MAX_LISTED_FILES) grid.append(h("li", { class: "md-imglib-empty" }, `Mostrando ${MAX_LISTED_FILES} de ${files.length}. Use o filtro para achar as outras.`));
  return grid;
}

export function selectablePaths(listing: LibraryListing, filter: string): string[] {
  const needle = filter.trim().toLocaleLowerCase("pt-BR");
  const matches = (path: string) => !needle || baseName(path).toLocaleLowerCase("pt-BR").includes(needle);
  const files = listing.files.filter((path) => (IMAGE_FILE_PATTERN.test(path) || VIDEO_FILE_PATTERN.test(path)) && matches(path));
  return [...listing.dirs.filter(matches), ...files.slice(0, MAX_LISTED_FILES)];
}

export type { LibraryCategory };
