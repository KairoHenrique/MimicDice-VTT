const ROW_SELECTOR = "li[data-combatant-id]";
const DROP_CLASSES = ["drop-before", "drop-after"];

function rowsOf(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>(ROW_SELECTOR));
}

function rowAt(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(ROW_SELECTOR) : null;
}

function isLowerHalf(row: HTMLElement, clientY: number): boolean {
  const box = row.getBoundingClientRect();
  return clientY > box.top + box.height / 2;
}

/** Index in the order once the dragged row leaves its old place. */
export function dropIndex(order: readonly string[], draggedId: string, targetId: string, after: boolean): number {
  const draggedIndex = order.indexOf(draggedId);
  let index = order.indexOf(targetId) + (after ? 1 : 0);
  if (draggedIndex >= 0 && draggedIndex < index) index -= 1;
  return Math.max(0, index);
}

/** GM only: drag a row of the turn order onto another to place it there; the order becomes manual. */
export function enableTurnOrderDragging(list: HTMLElement, combat: any): void {
  let draggedId: string | null = null;
  const clearMarks = () => {
    for (const row of rowsOf(list)) row.classList.remove("dragging", ...DROP_CLASSES);
  };
  for (const row of rowsOf(list)) row.draggable = true;
  list.addEventListener("dragstart", (event) => {
    const row = rowAt(event.target);
    if (!row || !event.dataTransfer) return;
    draggedId = row.dataset.combatantId ?? null;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId ?? "");
    row.classList.add("dragging");
  });
  list.addEventListener("dragover", (event) => {
    const row = rowAt(event.target);
    if (!draggedId || !row) return;
    event.preventDefault();
    for (const other of rowsOf(list)) other.classList.remove(...DROP_CLASSES);
    if (row.dataset.combatantId !== draggedId) row.classList.add(isLowerHalf(row, event.clientY) ? "drop-after" : "drop-before");
  });
  list.addEventListener("drop", (event) => {
    const row = rowAt(event.target);
    const movedId = draggedId;
    draggedId = null;
    clearMarks();
    if (!movedId || !row?.dataset.combatantId || row.dataset.combatantId === movedId) return;
    event.preventDefault();
    const order = rowsOf(list).map((candidate) => candidate.dataset.combatantId ?? "");
    void combat.moveCombatant(movedId, dropIndex(order, movedId, row.dataset.combatantId, isLowerHalf(row, event.clientY)));
  });
  list.addEventListener("dragend", () => {
    draggedId = null;
    clearMarks();
  });
}
