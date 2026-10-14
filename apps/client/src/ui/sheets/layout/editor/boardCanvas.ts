import { SHEET_GRID_COLUMNS, type SheetComponent, type SheetComponentKind, type SheetPage } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import type { BoardContext } from "../boardContext";
import { bottomRow, clampGroupDelta, clampRect, componentsInArea, type GridRect } from "../boardMutations";
import { isComponentKind, kindInfo } from "../componentCatalog";
import { buildComponentBody, gridPlacement } from "../componentView";
import { cellAt, readGridMetrics, type GridCell } from "./gridGeometry";

export const PALETTE_DRAG_TYPE = "application/x-mimicdice-component";
const SPARE_ROWS = 6;

export interface CanvasCallbacks {
  onSelect(componentIds: string[]): void;
  onPlace(componentId: string, rect: GridRect): void;
  onMoveGroup(componentIds: string[], dx: number, dy: number): void;
  onDropKind(kind: SheetComponentKind, cell: GridCell): void;
  onKey(componentId: string, event: KeyboardEvent): void;
}

interface CanvasState {
  readonly grid: HTMLElement;
  readonly page: SheetPage;
  readonly selected: Set<string>;
  readonly callbacks: CanvasCallbacks;
}

/** Selection is reflected in place so the element under the pointer survives the gesture. */
function markSelected(state: CanvasState): void {
  for (const cell of state.grid.querySelectorAll<HTMLElement>(".md-edit-cell")) {
    const isSelected = state.selected.has(cell.dataset.componentId ?? "");
    cell.classList.toggle("selected", isSelected);
    cell.setAttribute("aria-pressed", String(isSelected));
  }
}

function setSelection(state: CanvasState, ids: Iterable<string>): void {
  state.selected.clear();
  for (const id of ids) state.selected.add(id);
  markSelected(state);
  state.callbacks.onSelect([...state.selected]);
}

function setRows(grid: HTMLElement, rows: number): void {
  grid.style.setProperty("--md-rows", String(rows));
}

/** Follows one pointer gesture until release; `onEnd` runs once whether it ends normally or is cancelled. */
function followPointer(start: PointerEvent, onMove: (event: PointerEvent) => void, onEnd: () => void): void {
  const target = start.currentTarget as HTMLElement;
  target.setPointerCapture(start.pointerId);
  const finish = () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", finish);
    target.removeEventListener("pointercancel", finish);
    onEnd();
  };
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", finish);
  target.addEventListener("pointercancel", finish);
}

/** Moves or resizes one component, previewing the rect on the element and committing only when it changed. */
function trackSingle(state: CanvasState, cell: HTMLElement, component: SheetComponent, mode: "move" | "resize", start: PointerEvent): void {
  const metrics = readGridMetrics(state.grid, SHEET_GRID_COLUMNS);
  const origin = cellAt(metrics, start.clientX, start.clientY);
  const baseRows = Number(state.grid.style.getPropertyValue("--md-rows")) || 1;
  let current: GridRect = { x: component.x, y: component.y, w: component.w, h: component.h };
  cell.classList.add("dragging");
  followPointer(
    start,
    (event) => {
      const point = cellAt(metrics, event.clientX, event.clientY);
      current =
        mode === "move"
          ? clampRect({ ...component, x: component.x + point.col - origin.col, y: component.y + point.row - origin.row })
          : clampRect({ x: component.x, y: component.y, w: point.col - component.x + 1, h: point.row - component.y + 1 });
      cell.setAttribute("style", gridPlacement(current));
      setRows(state.grid, Math.max(baseRows, current.y + current.h + 2));
    },
    () => {
      cell.classList.remove("dragging");
      const changed = current.x !== component.x || current.y !== component.y || current.w !== component.w || current.h !== component.h;
      if (changed) state.callbacks.onPlace(component.id, current);
    },
  );
}

/** Drags every selected component together, keeping their relative positions. */
function trackGroup(state: CanvasState, start: PointerEvent): void {
  const metrics = readGridMetrics(state.grid, SHEET_GRID_COLUMNS);
  const origin = cellAt(metrics, start.clientX, start.clientY);
  const members = state.page.components.filter((component) => state.selected.has(component.id));
  const cells = new Map(members.map((component) => [component.id, state.grid.querySelector<HTMLElement>(`[data-component-id="${CSS.escape(component.id)}"]`)]));
  const baseRows = Number(state.grid.style.getPropertyValue("--md-rows")) || 1;
  let delta = { dx: 0, dy: 0 };
  for (const cell of cells.values()) cell?.classList.add("dragging");
  followPointer(
    start,
    (event) => {
      const point = cellAt(metrics, event.clientX, event.clientY);
      delta = clampGroupDelta(members, point.col - origin.col, point.row - origin.row);
      for (const component of members) cells.get(component.id)?.setAttribute("style", gridPlacement({ ...component, x: component.x + delta.dx, y: component.y + delta.dy }));
      setRows(state.grid, Math.max(baseRows, bottomRow(members) + delta.dy + 2));
    },
    () => {
      for (const cell of cells.values()) cell?.classList.remove("dragging");
      if (delta.dx !== 0 || delta.dy !== 0) state.callbacks.onMoveGroup(members.map((component) => component.id), delta.dx, delta.dy);
    },
  );
}

function onCellPointerDown(state: CanvasState, cell: HTMLElement, component: SheetComponent, event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  cell.focus({ preventScroll: true });
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    const next = new Set(state.selected);
    if (next.has(component.id)) next.delete(component.id);
    else next.add(component.id);
    setSelection(state, next);
    return;
  }
  if (state.selected.has(component.id) && state.selected.size > 1) {
    trackGroup(state, event);
    return;
  }
  setSelection(state, [component.id]);
  trackSingle(state, cell, component, "move", event);
}

function editCell(context: BoardContext, state: CanvasState, component: SheetComponent): HTMLElement {
  const info = kindInfo(component.kind);
  const name = component.label || component.content || info.label;
  const selected = state.selected.has(component.id);
  const handle = h("span", { class: "md-resize", title: "Arraste para redimensionar", "aria-hidden": "true" });
  const badge = h("span", { class: "md-edit-badge" }, h("i", { class: info.icon }), ` ${info.label}${component.key ? ` · @${component.key}` : ""}`);
  const cell = h(
    "div",
    { class: `md-cell md-edit-cell${selected ? " selected" : ""}`, style: gridPlacement(component), tabindex: 0, role: "button", "aria-pressed": String(selected), "aria-label": `${info.label}: ${name}`, "data-component-id": component.id, "data-focus-key": `cell:${component.id}` },
    buildComponentBody(context, component),
    badge,
    handle,
  );
  cell.addEventListener("pointerdown", (event) => onCellPointerDown(state, cell, component, event));
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelection(state, [component.id]);
    trackSingle(state, cell, component, "resize", event);
  });
  cell.addEventListener("keydown", (event) => state.callbacks.onKey(component.id, event));
  return cell;
}

/** Dragging on an empty spot draws a box; everything it touches gets selected (Shift adds to the selection). */
function trackMarquee(state: CanvasState, start: PointerEvent): void {
  const metrics = readGridMetrics(state.grid, SHEET_GRID_COLUMNS);
  const origin = cellAt(metrics, start.clientX, start.clientY);
  const additive = start.shiftKey || start.ctrlKey || start.metaKey;
  const initial = additive ? new Set(state.selected) : new Set<string>();
  const marquee = h("div", { class: "md-marquee", "aria-hidden": "true" });
  let area: GridRect | null = null;
  followPointer(
    start,
    (event) => {
      const point = cellAt(metrics, event.clientX, event.clientY);
      if (!area && point.col === origin.col && point.row === origin.row) return;
      area = { x: Math.min(origin.col, point.col), y: Math.min(origin.row, point.row), w: Math.abs(point.col - origin.col) + 1, h: Math.abs(point.row - origin.row) + 1 };
      marquee.setAttribute("style", gridPlacement(area));
      if (!marquee.isConnected) state.grid.append(marquee);
      state.selected.clear();
      for (const id of [...initial, ...componentsInArea(state.page.components, area)]) state.selected.add(id);
      markSelected(state);
    },
    () => {
      marquee.remove();
      setSelection(state, area ? state.selected : initial);
    },
  );
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

/** Editable grid: components show a live preview, move (alone or as a selected group), resize from the corner and accept palette drops. */
export function buildEditorCanvas(context: BoardContext, page: SheetPage, selectedIds: ReadonlySet<string>, callbacks: CanvasCallbacks): HTMLElement {
  const grid = h("div", { class: "md-board editing", "aria-label": "Área da ficha (arraste componentes para cá; arraste no vazio para selecionar vários)" });
  const state: CanvasState = { grid, page, selected: new Set(selectedIds), callbacks };
  setRows(grid, bottomRow(page.components) + SPARE_ROWS);
  for (const component of page.components) grid.append(editCell(context, state, component));
  grid.addEventListener("pointerdown", (event) => {
    if (event.target !== grid || event.button !== 0) return;
    event.preventDefault();
    trackMarquee(state, event);
  });
  acceptPaletteDrops(grid, callbacks);
  return grid;
}
