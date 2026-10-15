import { dataPathToUrl, imageTileDragData, type ImageTilePlacement } from "@tabbletop/api";
import { h } from "../../views/dom";

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
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function folderEntry(path: string, label: string, handlers: LibraryViewHandlers): HTMLElement {
  const button = h("button", { type: "button", class: "md-imglib-folder", title: `/${path}` }, h("i", { class: "fa-solid fa-folder", "aria-hidden": "true" }), h("span", { class: "md-imglib-name" }, label));
  button.addEventListener("click", () => handlers.openFolder(path));
  return h("li", {}, button);
}

function preview(path: string): HTMLElement {
  if (VIDEO_FILE_PATTERN.test(path)) return h("i", { class: "fa-solid fa-film md-imglib-thumb md-imglib-thumb-icon", "aria-hidden": "true" });
  return h("img", { class: "md-imglib-thumb", src: dataPathToUrl(path), alt: "", loading: "lazy", draggable: "false" });
}

function imageEntry(path: string, handlers: LibraryViewHandlers): HTMLElement {
  const name = baseName(path);
  const item = h(
    "li",
    { class: "md-imglib-image", draggable: "true", tabIndex: 0, title: `${name}\nArraste para o mapa (duplo clique: coloca no centro da tela)`, "aria-label": `${name}: arraste para o mapa ou aperte Enter para colocar no centro` },
    preview(path),
    h("span", { class: "md-imglib-name" }, name),
  );
  item.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", JSON.stringify(imageTileDragData(path, handlers.placement(path))));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    const thumb = item.querySelector("img");
    if (thumb && event.dataTransfer) event.dataTransfer.setDragImage(thumb, thumb.width / 2, thumb.height / 2);
  });
  item.addEventListener("dblclick", () => handlers.placeAtViewCenter(path));
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handlers.placeAtViewCenter(path);
  });
  return item;
}

/** Folders first, then the images whose name contains the filter. */
export function libraryGrid(listing: LibraryListing, filter: string, handlers: LibraryViewHandlers): HTMLElement {
  const needle = filter.trim().toLocaleLowerCase("pt-BR");
  const matches = (path: string) => !needle || baseName(path).toLocaleLowerCase("pt-BR").includes(needle);
  const files = listing.files.filter((path) => (IMAGE_FILE_PATTERN.test(path) || VIDEO_FILE_PATTERN.test(path)) && matches(path));
  const grid = h(
    "ul",
    { class: "md-imglib-grid", "aria-label": "Imagens da pasta" },
    ...listing.dirs.filter(matches).map((path) => folderEntry(path, listing.labels[path] ?? baseName(path), handlers)),
    ...files.slice(0, MAX_LISTED_FILES).map((path) => imageEntry(path, handlers)),
  );
  if (grid.childElementCount === 0) grid.append(h("li", { class: "md-imglib-empty" }, needle ? "Nada com esse nome aqui." : "Sem imagens nesta pasta. Envie com o botão de upload ou arraste arquivos do computador para cá."));
  if (files.length > MAX_LISTED_FILES) grid.append(h("li", { class: "md-imglib-empty" }, `Mostrando ${MAX_LISTED_FILES} de ${files.length}. Use o filtro para achar as outras.`));
  return grid;
}
