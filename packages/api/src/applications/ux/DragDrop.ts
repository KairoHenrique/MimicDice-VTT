type DragDropEvent = "dragstart" | "dragover" | "dragenter" | "dragleave" | "dragend" | "drop";
type DragDropCallback = (event: DragEvent) => unknown;
type DragDropPermission = (selector: string | null) => boolean;

export interface DragDropConfiguration {
  dragSelector?: string | null;
  dropSelector?: string | null;
  permissions?: Partial<Record<"dragstart" | "drop", DragDropPermission>>;
  callbacks?: Partial<Record<DragDropEvent, DragDropCallback>>;
}

/** Binds HTML5 drag-and-drop workflows to the elements matching configured selectors. */
export class DragDrop {
  static get implementation(): typeof DragDrop {
    return ((globalThis as any).CONFIG?.ux?.DragDrop as typeof DragDrop | undefined) ?? DragDrop;
  }

  static createDragImage(image: HTMLImageElement, width: number, height: number): HTMLElement {
    let preview = document.getElementById("drag-preview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "drag-preview";
      preview.style.cssText = "position:fixed;top:-1000px;left:-1000px;pointer-events:none;";
      preview.append(document.createElement("img"));
      document.body.append(preview);
    }
    const previewImage = preview.querySelector("img") as HTMLImageElement;
    previewImage.src = image.src;
    previewImage.width = width;
    previewImage.height = height;
    return preview;
  }

  readonly dragSelector: string | null;
  readonly dropSelector: string | null;
  readonly permissions: Partial<Record<"dragstart" | "drop", DragDropPermission>>;
  readonly callbacks: Partial<Record<DragDropEvent, DragDropCallback>>;

  constructor({ dragSelector = null, dropSelector = null, permissions = {}, callbacks = {} }: DragDropConfiguration = {}) {
    this.dragSelector = dragSelector;
    this.dropSelector = dropSelector;
    this.permissions = permissions;
    this.callbacks = callbacks;
  }

  bind(html: HTMLElement | { 0?: HTMLElement }): this {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return this;
    if (this.dragSelector && this.can("dragstart", this.dragSelector)) this.#bindDragSources(root, this.dragSelector);
    if (this.dropSelector !== undefined && this.can("drop", this.dropSelector)) this.#bindDropTargets(root, this.dropSelector);
    return this;
  }

  can(action: "dragstart" | "drop", selector: string | null): boolean {
    const permission = this.permissions[action];
    return permission ? permission(selector) : true;
  }

  callback(event: DragEvent, action: DragDropEvent): unknown {
    return this.callbacks[action]?.(event);
  }

  #bindDragSources(root: HTMLElement, selector: string): void {
    for (const source of root.querySelectorAll<HTMLElement>(selector)) {
      source.setAttribute("draggable", "true");
      source.addEventListener("dragstart", (event) => this.callback(event, "dragstart"));
      source.addEventListener("dragend", (event) => this.callback(event, "dragend"));
    }
  }

  #bindDropTargets(root: HTMLElement, selector: string | null): void {
    const targets = selector ? Array.from(root.querySelectorAll<HTMLElement>(selector)) : [root];
    if (selector && root.matches(selector)) targets.push(root);
    for (const target of targets) {
      target.addEventListener("dragover", (event) => {
        event.preventDefault();
        this.callback(event, "dragover");
      });
      target.addEventListener("dragenter", (event) => this.callback(event, "dragenter"));
      target.addEventListener("dragleave", (event) => this.callback(event, "dragleave"));
      target.addEventListener("drop", (event) => {
        event.preventDefault();
        this.callback(event, "drop");
      });
    }
  }
}
