const EDGE_MARGIN_PX = 8;

export interface PanelPosition {
  left: number;
  top: number;
}

/** Where a floating panel sits on screen: kept inside the window, moved by dragging its header, remembered per browser. */
export class FloatingPanelPosition {
  constructor(
    private readonly storageKey: string,
    private readonly fallback: PanelPosition | (() => PanelPosition),
  ) {}

  read(): PanelPosition {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? "null");
      if (parsed && typeof parsed === "object" && Number.isFinite((parsed as PanelPosition).left) && Number.isFinite((parsed as PanelPosition).top)) {
        return { left: (parsed as PanelPosition).left, top: (parsed as PanelPosition).top };
      }
    } catch {
      // A corrupt entry just resets the panel position.
    }
    return typeof this.fallback === "function" ? this.fallback() : { ...this.fallback };
  }

  place(panel: HTMLElement, position: PanelPosition = this.read()): PanelPosition {
    const maxLeft = Math.max(EDGE_MARGIN_PX, window.innerWidth - panel.offsetWidth - EDGE_MARGIN_PX);
    const maxTop = Math.max(EDGE_MARGIN_PX, window.innerHeight - panel.offsetHeight - EDGE_MARGIN_PX);
    const placed = { left: Math.min(Math.max(EDGE_MARGIN_PX, position.left), maxLeft), top: Math.min(Math.max(EDGE_MARGIN_PX, position.top), maxTop) };
    panel.style.left = `${placed.left}px`;
    panel.style.top = `${placed.top}px`;
    return placed;
  }

  enableDragging(header: HTMLElement, panelOf: () => HTMLElement | null): void {
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, input, select"))) return;
      const panel = panelOf();
      if (!panel) return;
      event.preventDefault();
      const offset = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
      let placed = { left: panel.offsetLeft, top: panel.offsetTop };
      header.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        placed = this.place(panel, { left: moveEvent.clientX - offset.x, top: moveEvent.clientY - offset.y });
      };
      const end = () => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", end);
        header.removeEventListener("pointercancel", end);
        localStorage.setItem(this.storageKey, JSON.stringify(placed));
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", end);
      header.addEventListener("pointercancel", end);
    });
  }
}
