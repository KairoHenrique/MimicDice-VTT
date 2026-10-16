import type { RpgEntry } from "@tabbletop/protocol";
import { h } from "../views/dom";
import { fileKindOf, formatBytes, formatDate, iconFor } from "./fileKinds";
import { fileUrl } from "./rpgsApi";

export const ENTRY_DRAG_TYPE = "application/x-tabbletop-rpg-path";
export const ENTRY_DRAG_PATHS_TYPE = "application/x-tabbletop-rpg-paths";

export interface EntryCardHandlers {
  onSelect(entry: RpgEntry, event: MouseEvent): void;
  onOpen(entry: RpgEntry): void;
  onContextMenu(entry: RpgEntry, event: MouseEvent): void;
  /** Something was dropped on a folder: another entry being moved, or files from the computer. */
  onDropIntoFolder(folder: RpgEntry, dataTransfer: DataTransfer): void;
  isSelected(path: string): boolean;
  /** Paths to drag when starting from this card (the selection, or just this card). */
  dragPaths(entry: RpgEntry): string[];
}

function buildThumbnail(entry: RpgEntry): HTMLElement {
  const kind = fileKindOf(entry.name, entry.kind === "folder");
  if (kind === "image") return h("div", { class: "entry-thumb" }, h("img", { src: fileUrl(entry.path), alt: "", loading: "lazy", decoding: "async", draggable: "false" }));
  return h("div", { class: `entry-thumb icon kind-${kind}` }, h("i", { class: iconFor(kind) }));
}

/** Folders accept drops; any card can be dragged onto a folder or the breadcrumb to move it. */
function enableDragAndDrop(card: HTMLElement, entry: RpgEntry, handlers: EntryCardHandlers): void {
  card.draggable = true;
  card.addEventListener("dragstart", (event) => {
    const paths = handlers.dragPaths(entry);
    event.dataTransfer?.setData(ENTRY_DRAG_TYPE, paths[0] ?? entry.path);
    event.dataTransfer?.setData(ENTRY_DRAG_PATHS_TYPE, JSON.stringify(paths));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  if (entry.kind !== "folder") return;
  card.addEventListener("dragover", (event) => {
    const types = event.dataTransfer?.types ?? [];
    if (!types.includes(ENTRY_DRAG_TYPE) && !types.includes(ENTRY_DRAG_PATHS_TYPE) && !types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    card.classList.add("drop-target");
  });
  card.addEventListener("dragleave", () => card.classList.remove("drop-target"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    card.classList.remove("drop-target");
    if (event.dataTransfer) handlers.onDropIntoFolder(entry, event.dataTransfer);
  });
}

export function buildEntryCard(entry: RpgEntry, selected: boolean, handlers: EntryCardHandlers): HTMLElement {
  const details = entry.kind === "folder" ? "Pasta" : formatBytes(entry.size);
  const card = h(
    "li",
    { class: `entry-card${selected ? " selected" : ""}`, tabindex: 0, "data-path": entry.path, title: entry.name, "aria-selected": selected ? "true" : "false" },
    buildThumbnail(entry),
    h("span", { class: "entry-name" }, entry.name),
    h("span", { class: "entry-details" }, details),
    h("span", { class: "entry-modified" }, formatDate(entry.modified)),
  );
  card.addEventListener("click", (event) => handlers.onSelect(entry, event));
  card.addEventListener("dblclick", () => handlers.onOpen(entry));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handlers.onOpen(entry);
  });
  card.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!handlers.isSelected(entry.path)) handlers.onSelect(entry, event);
    handlers.onContextMenu(entry, event);
  });
  enableDragAndDrop(card, entry, handlers);
  return card;
}

/** Reads one or many paths from an internal drag of Arquivos entries. */
export function pathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const many = dataTransfer.getData(ENTRY_DRAG_PATHS_TYPE);
  if (many) {
    try {
      const parsed = JSON.parse(many) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((path): path is string => typeof path === "string" && path.length > 0);
    } catch {
      /* fall through */
    }
  }
  const one = dataTransfer.getData(ENTRY_DRAG_TYPE);
  return one ? [one] : [];
}
