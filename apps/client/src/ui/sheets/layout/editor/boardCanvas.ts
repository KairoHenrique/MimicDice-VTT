import { SHEET_GRID_COLUMNS, type SheetComponent, type SheetComponentKind, type SheetPage } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import type { BoardContext } from "../boardContext";
import { bottomRow, clampRect, type GridRect } from "../boardMutations";
import { isComponentKind, kindInfo } from "../componentCatalog";
import { buildComponentBody, gridPlacement } from "../componentView";
import { cellAt, readGridMetrics, type GridCell } from "./gridGeometry";

export const PALETTE_DRAG_TYPE = "application/x-mimicdice-component";
const SPARE_ROWS = 6;

export interface CanvasCallbacks {
  onSelect(componentId: string | null): void;
  onPlace(componentId: string, rect: GridRect): void;
  onDropKind(kind: SheetComponentKind, cell: GridCell): void;
  onKey(componentId: string, event: KeyboardEvent): void;
}

type GestureMode = "move" | "resize";

/** Selection is reflected in place so the element under the pointer survives the gesture. */
function markSelected(grid: HTMLElement, cell: HTMLElement | null): void {
  for (const other of grid.querySelectorAll(".md-edit-cell.selected")) {
    other.classList.remove("selected");
    other.setAttribute("aria-pressed", "false");
  }
  cell?.classList.add("selected");
  cell?.setAttribute("aria-pressed", "true");
}

function setRows(grid: HTMLElement, rows: number): void {
  grid.style.setProperty("--md-rows", String(rows));
}

/** Follows one pointer gesture, previewing the rect on the element and committing only when it changed. */
function trackGesture(grid: HTMLElement, cell: HTMLElement, component: SheetComponent, mode: GestureMode, start: PointerEvent, callbacks: CanvasCallbacks): void {
  const metrics = readGridMetrics(grid, SHEET_GRID_COLUMNS);
  const origin = cellAt(metrics, start.clientX, start.clientY);
  const baseRows = Number(grid.style.getPropertyValue("--md-rows")) || 1;
  let current: GridRect = { x: component.x, y: component.y, w: component.w, h: component.h };
  const target = start.currentTarget as HTMLElement;
  target.setPointerCapture(start.pointerId);
  cell.classList.add("dragging");

  const onMove = (event: PointerEvent) => {
    const point = cellAt(metrics, event.clientX, event.clientY);
    current =
      mode === "move"
        ? clampRect({ ...component, x: component.x + point.col - origin.col, y: component.y + point.row - origin.row })
        : clampRect({ x: component.x, y: component.y, w: point.col - component.x + 1, h: point.row - component.y + 1 });
    cell.setAttribute("style", gridPlacement(current));
    setRows(grid, Math.max(baseRows, current.y + current.h + 2));
  };
  const onEnd = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onEnd);
    target.removeEventListener("pointercancel", onEnd);
    cell.classList.remove("dragging");
    const changed = current.x !== component.x || current.y !== component.y || current.w !== component.w || current.h !== component.h;
    if (changed) callbacks.onPlace(component.id, current);
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onEnd);
  target.addEventListener("pointercancel", onEnd);
}

function editCell(context: BoardContext, grid: HTMLElement, component: SheetComponent, selected: boolean, callbacks: CanvasCallbacks): HTMLElement {
  const info = kindInfo(component.kind);
  const name = component.label || component.content || info.label;
  const handle = h("span", { class: "md-resize", title: "Arraste para redimensionar", "aria-hidden": "true" });
  const badge = h("span", { class: "md-edit-badge" }, h("i", { class: info.icon }), ` ${info.label}${component.key ? ` · @${component.key}` : ""}`);
  const cell = h(
    "div",
    { class: `md-cell md-edit-cell${selected ? " selected" : ""}`, style: gridPlacement(component), tabindex: 0, role: "button", "aria-pressed": String(selected), "aria-label": `${info.label}: ${name}`, "data-component-id": component.id, "data-focus-key": `cell:${component.id}` },
    buildComponentBody(context, component),
    badge,
    handle,
  );
  cell.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cell.focus({ preventScroll: true });
    markSelected(grid, cell);
    callbacks.onSelect(component.id);
    trackGesture(grid, cell, component, "move", event, callbacks);
  });
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    trackGesture(grid, cell, component, "resize", event, callbacks);
  });
  cell.addEventListener("keydown", (event) => callbacks.onKey(component.id, event));
  return cell;
}

function acceptPaletteDrops(grid: HTMLElement, callbacks: CanvasCallbacks): void {
  grid.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes(PALETTE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    grid.classList.add("drop-target");
  });
  grid.addEventListener("dragleave", () => grid.classList.remove("drop-target"));
  grid.addEventListener("drop", (event) => {
    grid.classList.remove("drop-target");
    const kind = event.dataTransfer?.getData(PALETTE_DRAG_TYPE) ?? "";
    if (!isComponentKind(kind)) return;
    event.preventDefault();
    callbacks.onDropKind(kind, cellAt(readGridMetrics(grid, SHEET_GRID_COLUMNS), event.clientX, event.clientY));
  });
}

/** Editable grid: components show a live preview, move by dragging, resize from the corner and accept palette drops. */
export function buildEditorCanvas(context: BoardContext, page: SheetPage, selectedId: string | null, callbacks: CanvasCallbacks): HTMLElement {
  const grid = h("div", { class: "md-board editing", "aria-label": "Área da ficha (arraste componentes para cá)" });
  setRows(grid, bottomRow(page.components) + SPARE_ROWS);
  for (const component of page.components) grid.append(editCell(context, grid, component, component.id === selectedId, callbacks));
  grid.addEventListener("pointerdown", (event) => {
    if (event.target !== grid) return;
    markSelected(grid, null);
    callbacks.onSelect(null);
  });
  acceptPaletteDrops(grid, callbacks);
  return grid;
}
