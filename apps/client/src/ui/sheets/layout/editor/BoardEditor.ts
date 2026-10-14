import { sheetLayoutSchema, type SheetComponent, type SheetComponentKind, type SheetLayout } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import { BoardContext } from "../boardContext";
import * as mutate from "../boardMutations";
import { resolveActivePage } from "../boardView";
import { buildEditorCanvas, type CanvasCallbacks } from "./boardCanvas";
import { buildPalette } from "./boardPalette";
import { buildComponentInspector } from "./componentInspector";
import { DebouncedSaver } from "./DebouncedSaver";
import { EditHistory } from "./EditHistory";
import { componentKeyAction } from "./editorKeys";
import { buildPageBar } from "./pageBar";

const SAVE_DELAY_MS = 400;
const RECT_FIELDS = ["x", "y", "w", "h"] as const;

/** Drag-and-drop sheet builder; keeps a local draft so dragging stays instant and saves are batched. */
export class BoardEditor {
  readonly element = h("div", { class: "md-editor" });
  readonly #history = new EditHistory<SheetLayout>();
  #layout: SheetLayout;
  #pageId: string;
  #selectedIds: string[] = [];
  readonly #saver: DebouncedSaver<SheetLayout>;
  #inspectorSlot: HTMLElement | null = null;

  constructor(
    private readonly actor: any,
    layout: SheetLayout,
    persist: (layout: SheetLayout) => Promise<void>,
    pageId: string | null,
  ) {
    this.#saver = new DebouncedSaver(persist, SAVE_DELAY_MS, (error) => ui.notifications.error(`Não foi possível salvar a ficha: ${error.message}`));
    this.#layout = layout;
    this.#pageId = resolveActivePage(layout, pageId).id;
    for (const type of ["change", "input", "submit"]) this.element.addEventListener(type, (event) => event.stopPropagation());
  }

  get pageId(): string {
    return this.#pageId;
  }

  /** Adopts the stored layout unless local edits have not been saved yet. */
  syncFromDocument(layout: SheetLayout): void {
    if (this.#saver.isClean) this.#layout = layout;
  }

  render(): HTMLElement {
    const focusKey = (document.activeElement as HTMLElement | null)?.closest?.(".md-editor") === this.element ? (document.activeElement as HTMLElement).dataset.focusKey : undefined;
    const page = resolveActivePage(this.#layout, this.#pageId);
    this.#pageId = page.id;
    const context = new BoardContext(this.actor, this.#layout, false);
    this.#inspectorSlot = h("div", { class: "md-inspector-slot" }, this.#inspector());
    const canvas = h("div", { class: "md-editor-canvas" }, buildEditorCanvas(context, page, new Set(this.#selectedIds), this.#canvasCallbacks()));
    this.element.replaceChildren(buildPageBar(this.#layout, page, this.#pageActions()), h("div", { class: "md-editor-body" }, buildPalette((kind) => this.#addKind(kind)), canvas, this.#inspectorSlot));
    if (focusKey) this.element.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    return this.element;
  }

  flush(): Promise<void> {
    return this.#saver.flush();
  }

  get #selectedId(): string | null {
    return this.#selectedIds.length === 1 ? this.#selectedIds[0] : null;
  }

  #selected(): SheetComponent | null {
    return resolveActivePage(this.#layout, this.#pageId).components.find((component) => component.id === this.#selectedId) ?? null;
  }

  #inspector(): HTMLElement {
    if (this.#selectedIds.length > 1) return this.#groupInspector();
    const id = this.#selectedId;
    return buildComponentInspector(this.#layout, this.#selected(), {
      patch: (patch) => id && this.#patch(id, patch),
      duplicate: () => id && this.#duplicate(id),
      remove: () => id && this.#remove(id),
      bringToFront: () => id && this.#apply(mutate.reorderComponent(this.#layout, this.#pageId, id, true)),
      sendToBack: () => id && this.#apply(mutate.reorderComponent(this.#layout, this.#pageId, id, false)),
      refresh: () => this.render(),
    });
  }

  #groupInspector(): HTMLElement {
    const count = this.#selectedIds.length;
    const button = (icon: string, label: string, onClick: () => void, danger = false) => {
      const element = h("button", { type: "button", class: danger ? "danger" : "" }, h("i", { class: icon }), ` ${label}`);
      element.addEventListener("click", onClick);
      return element;
    };
    return h(
      "div",
      { class: "md-inspector md-group-inspector" },
      h("h3", {}, h("i", { class: "fa-solid fa-object-group" }), ` ${count} componentes selecionados`),
      h("p", { class: "hint" }, "Arraste qualquer um deles para mover o grupo todo. Setas movem, Delete apaga e Ctrl+D duplica. Shift ou Ctrl + clique tira ou põe um componente na seleção."),
      h(
        "div",
        { class: "md-group-actions" },
        button("fa-solid fa-clone", "Duplicar", () => this.#duplicateSelection()),
        button("fa-solid fa-xmark", "Tirar seleção", () => this.#select([])),
        button("fa-solid fa-trash", "Apagar todos", () => this.#removeSelection(), true),
      ),
    );
  }

  #select(componentIds: string[]): void {
    this.#selectedIds = componentIds;
    this.#inspectorSlot?.replaceChildren(this.#inspector());
  }

  #apply(next: SheetLayout, selectIds: string | string[] | null = this.#selectedIds): void {
    const parsed = sheetLayoutSchema.safeParse(next);
    if (!parsed.success) {
      ui.notifications.warn(`Alteração inválida: ${parsed.error.issues[0]?.message ?? "dados fora do limite"}.`);
      this.render();
      return;
    }
    this.#history.record(this.#layout);
    this.#layout = parsed.data;
    this.#selectedIds = selectIds === null ? [] : typeof selectIds === "string" ? [selectIds] : selectIds;
    this.#saver.schedule(this.#layout);
    this.render();
  }

  #patch(componentId: string, patch: Partial<SheetComponent>): void {
    let next = mutate.updateComponent(this.#layout, this.#pageId, componentId, patch);
    if (RECT_FIELDS.some((field) => field in patch)) {
      const updated = resolveActivePage(next, this.#pageId).components.find((component) => component.id === componentId);
      if (updated) next = mutate.placeComponent(next, this.#pageId, componentId, updated);
    }
    this.#apply(next);
  }

  #addKind(kind: SheetComponentKind, at?: { x: number; y: number }): void {
    try {
      const page = resolveActivePage(this.#layout, this.#pageId);
      const component = mutate.createComponent(this.#layout, page, kind, at);
      this.#apply(mutate.addComponent(this.#layout, page.id, component), component.id);
    } catch (error) {
      ui.notifications.warn(error instanceof Error ? error.message : "Não foi possível adicionar.");
    }
  }

  #duplicate(componentId: string): void {
    const { layout, copyId } = mutate.duplicateComponent(this.#layout, this.#pageId, componentId);
    if (copyId) this.#apply(layout, copyId);
  }

  #remove(componentId: string): void {
    this.#apply(mutate.removeComponent(this.#layout, this.#pageId, componentId), null);
  }

  #removeSelection(): void {
    this.#apply(mutate.removeComponents(this.#layout, this.#pageId, new Set(this.#selectedIds)), null);
  }

  #duplicateSelection(): void {
    let layout = this.#layout;
    const copies: string[] = [];
    try {
      for (const id of this.#selectedIds) {
        const result = mutate.duplicateComponent(layout, this.#pageId, id);
        layout = result.layout;
        if (result.copyId) copies.push(result.copyId);
      }
    } catch (error) {
      ui.notifications.warn(error instanceof Error ? error.message : "Não foi possível duplicar.");
      return;
    }
    this.#apply(layout, copies);
  }

  #moveSelection(dx: number, dy: number): void {
    this.#apply(mutate.moveComponents(this.#layout, this.#pageId, new Set(this.#selectedIds), dx, dy));
  }

  #restore(snapshot: SheetLayout | null): void {
    if (!snapshot) return;
    this.#layout = snapshot;
    this.#selectedIds = [];
    this.#saver.schedule(snapshot);
    this.render();
  }

  #canvasCallbacks(): CanvasCallbacks {
    return {
      onSelect: (componentIds) => this.#select(componentIds),
      onPlace: (componentId, rect) => this.#apply(mutate.placeComponent(this.#layout, this.#pageId, componentId, rect), componentId),
      onMoveGroup: (componentIds, dx, dy) => this.#apply(mutate.moveComponents(this.#layout, this.#pageId, new Set(componentIds), dx, dy), componentIds),
      onDropKind: (kind, cell) => this.#addKind(kind, { x: cell.col, y: cell.row }),
      onKey: (componentId, event) => this.#onKey(componentId, event),
    };
  }

  #onKey(componentId: string, event: KeyboardEvent): void {
    const action = componentKeyAction(event);
    if (!action) return;
    if (this.#selectedIds.length > 1 && this.#onGroupKey(action)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const component = this.#selected() ?? resolveActivePage(this.#layout, this.#pageId).components.find((entry) => entry.id === componentId);
    if (!component) return;
    event.preventDefault();
    event.stopPropagation();
    this.#selectedIds = [component.id];
    if (action.type === "nudge") this.#apply(mutate.placeComponent(this.#layout, this.#pageId, component.id, { ...component, x: component.x + action.dx, y: component.y + action.dy }));
    else if (action.type === "resize") this.#apply(mutate.placeComponent(this.#layout, this.#pageId, component.id, { ...component, w: component.w + action.dw, h: component.h + action.dh }));
    else if (action.type === "remove") this.#remove(component.id);
    else if (action.type === "duplicate") this.#duplicate(component.id);
    else if (action.type === "deselect") this.#select([]);
    else if (action.type === "undo") this.#restore(this.#history.undo(this.#layout));
    else this.#restore(this.#history.redo(this.#layout));
  }

  /** Keys that act on the whole selection; resizing and undo keep their single-component meaning. */
  #onGroupKey(action: NonNullable<ReturnType<typeof componentKeyAction>>): boolean {
    if (action.type === "nudge") this.#moveSelection(action.dx, action.dy);
    else if (action.type === "remove") this.#removeSelection();
    else if (action.type === "duplicate") this.#duplicateSelection();
    else if (action.type === "deselect") this.#select([]);
    else return false;
    return true;
  }

  #pageActions() {
    return {
      select: (pageId: string) => {
        this.#pageId = pageId;
        this.#selectedIds = [];
        this.render();
      },
      add: () => this.#guard(() => {
        const { layout, pageId } = mutate.addPage(this.#layout, `Página ${this.#layout.pages.length + 1}`);
        this.#pageId = pageId;
        this.#apply(layout, null);
      }),
      rename: (title: string) => this.#apply(mutate.renamePage(this.#layout, this.#pageId, title)),
      move: (direction: -1 | 1) => this.#apply(mutate.movePage(this.#layout, this.#pageId, direction)),
      remove: () => this.#guard(() => this.#apply(mutate.removePage(this.#layout, this.#pageId), null)),
      undo: () => this.#restore(this.#history.undo(this.#layout)),
      redo: () => this.#restore(this.#history.redo(this.#layout)),
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
    };
  }

  #guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      ui.notifications.warn(error instanceof Error ? error.message : "Ação não permitida.");
    }
  }

}
