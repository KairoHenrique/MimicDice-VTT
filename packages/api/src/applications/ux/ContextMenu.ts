import jQuery from "jquery";
import { localize } from "../../runtime";

export interface ContextMenuEntry {
  name: string;
  icon?: string;
  classes?: string;
  group?: string;
  condition?: boolean | ((target: unknown) => boolean);
  callback?: (target: unknown) => unknown;
}

export interface ContextMenuOptions {
  eventName?: string;
  jQuery?: boolean;
  fixed?: boolean;
  onOpen?: (target: HTMLElement) => void;
  onClose?: (target: HTMLElement) => void;
}

/** Only `<i class="...">` icons are accepted from packages; anything else is dropped rather than injected as HTML. */
const SAFE_ICON_PATTERN = /^\s*<i\s+class="([A-Za-z0-9 _-]{1,120})"\s*>\s*<\/i>\s*$/;
const MENU_ID = "context-menu";

/** Right-click menu bound to every element matching `selector` inside `container`. */
export class ContextMenu {
  readonly container: HTMLElement;
  readonly selector: string;
  menuItems: ContextMenuEntry[];
  readonly options: Required<Pick<ContextMenuOptions, "eventName" | "jQuery" | "fixed">> & ContextMenuOptions;
  #menu: HTMLElement | null = null;
  #target: HTMLElement | null = null;
  #dismiss = (event: Event) => {
    if (this.#menu && event.target instanceof Node && this.#menu.contains(event.target)) return;
    this.close();
  };

  constructor(container: HTMLElement | { 0?: HTMLElement }, selector: string, menuItems: ContextMenuEntry[] = [], options: ContextMenuOptions = {}) {
    this.container = (container instanceof HTMLElement ? container : container?.[0]) as HTMLElement;
    this.selector = selector || ":scope";
    this.menuItems = Array.isArray(menuItems) ? menuItems : [];
    this.options = { eventName: "contextmenu", jQuery: false, fixed: false, ...options };
    this.bind();
  }

  static create(application: unknown, html: HTMLElement, selector: string, menuItems: ContextMenuEntry[], options: ContextMenuOptions = {}): ContextMenu {
    void application;
    return new this(html, selector, menuItems, options);
  }

  get element(): HTMLElement | null {
    return this.#menu;
  }

  get target(): HTMLElement | null {
    return this.#target;
  }

  bind(): void {
    if (!this.container) return;
    this.container.addEventListener(this.options.eventName, (event) => {
      const target = (event.target as HTMLElement | null)?.closest?.(this.selector) as HTMLElement | null;
      if (!target || !this.container.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      this.render(target, event as MouseEvent);
    });
  }

  #wrapTarget(target: HTMLElement): unknown {
    return this.options.jQuery ? jQuery(target) : target;
  }

  #visibleItems(target: HTMLElement): ContextMenuEntry[] {
    const wrapped = this.#wrapTarget(target);
    return this.menuItems.filter((item) => {
      if (typeof item.condition === "function") {
        try {
          return item.condition(wrapped);
        } catch {
          return false;
        }
      }
      return item.condition !== false;
    });
  }

  render(target: HTMLElement, event?: MouseEvent): void {
    this.close();
    const items = this.#visibleItems(target);
    if (items.length === 0) return;
    this.#target = target;
    const menu = document.createElement("nav");
    menu.id = MENU_ID;
    menu.className = "context-menu themed";
    const list = document.createElement("menu");
    list.className = "context-items";
    for (const item of items) list.append(this.#buildItem(item, target));
    menu.append(list);
    document.body.append(menu);
    this.#position(menu, event, target);
    this.#menu = menu;
    this.options.onOpen?.(target);
    setTimeout(() => document.addEventListener("pointerdown", this.#dismiss, true));
  }

  #buildItem(item: ContextMenuEntry, target: HTMLElement): HTMLElement {
    const entry = document.createElement("li");
    entry.className = `context-item ${item.classes ?? ""}`.trim();
    const iconMatch = SAFE_ICON_PATTERN.exec(item.icon ?? "");
    if (iconMatch) {
      const icon = document.createElement("i");
      icon.className = iconMatch[1];
      entry.append(icon, " ");
    }
    entry.append(document.createTextNode(localize(item.name ?? "")));
    entry.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      void item.callback?.(this.#wrapTarget(target));
    });
    return entry;
  }

  #position(menu: HTMLElement, event: MouseEvent | undefined, target: HTMLElement): void {
    const rect = target.getBoundingClientRect();
    const x = event?.clientX ?? rect.left;
    const y = event?.clientY ?? rect.bottom;
    menu.style.position = "fixed";
    menu.style.zIndex = "10000";
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width - 4))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height - 4))}px`;
  }

  async close({ animate: _animate = true }: { animate?: boolean } = {}): Promise<void> {
    document.removeEventListener("pointerdown", this.#dismiss, true);
    if (!this.#menu) return;
    this.#menu.remove();
    this.#menu = null;
    const target = this.#target;
    this.#target = null;
    if (target) this.options.onClose?.(target);
  }

  static eventListeners(): void {}
}
