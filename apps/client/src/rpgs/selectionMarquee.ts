/** Rubber-band selection like Windows Explorer: drag on empty space to select intersecting items. */

export interface MarqueeOptions {
  container: HTMLElement;
  itemSelector: string;
  pathAttribute?: string;
  onComplete: (paths: string[], additive: boolean) => void;
  /** Return false to ignore the gesture (e.g. started on a card). */
  shouldStart?: (event: PointerEvent) => boolean;
}

export function installSelectionMarquee(options: MarqueeOptions): () => void {
  const pathAttribute = options.pathAttribute ?? "data-path";
  let origin: { x: number; y: number } | null = null;
  let box: HTMLElement | null = null;
  let additive = false;

  const cleanupBox = () => {
    box?.remove();
    box = null;
    origin = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (options.shouldStart && !options.shouldStart(event)) return;
    if ((event.target as HTMLElement).closest(options.itemSelector)) return;
    origin = { x: event.clientX, y: event.clientY };
    additive = event.ctrlKey || event.metaKey || event.shiftKey;
    box = document.createElement("div");
    box.className = "selection-marquee";
    box.style.left = `${origin.x}px`;
    box.style.top = `${origin.y}px`;
    document.body.append(box);
    options.container.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!origin || !box) return;
    const left = Math.min(origin.x, event.clientX);
    const top = Math.min(origin.y, event.clientY);
    const width = Math.abs(event.clientX - origin.x);
    const height = Math.abs(event.clientY - origin.y);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!origin || !box) return;
    const rect = box.getBoundingClientRect();
    const paths: string[] = [];
    for (const item of options.container.querySelectorAll<HTMLElement>(options.itemSelector)) {
      const itemRect = item.getBoundingClientRect();
      const hits = itemRect.right >= rect.left && itemRect.left <= rect.right && itemRect.bottom >= rect.top && itemRect.top <= rect.bottom;
      const path = item.getAttribute(pathAttribute);
      if (hits && path) paths.push(path);
    }
    cleanupBox();
    try {
      options.container.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (paths.length || additive) options.onComplete(paths, additive);
  };

  options.container.addEventListener("pointerdown", onPointerDown);
  options.container.addEventListener("pointermove", onPointerMove);
  options.container.addEventListener("pointerup", onPointerUp);
  options.container.addEventListener("pointercancel", cleanupBox);

  return () => {
    cleanupBox();
    options.container.removeEventListener("pointerdown", onPointerDown);
    options.container.removeEventListener("pointermove", onPointerMove);
    options.container.removeEventListener("pointerup", onPointerUp);
    options.container.removeEventListener("pointercancel", cleanupBox);
  };
}
