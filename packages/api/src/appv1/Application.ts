import { inheritanceChainOf, nextZIndex } from "../applications/applicationRegistry";
import { renderTemplate } from "../handlebars/templates";
import { Hooks } from "../hooks/Hooks";
import { currentUi, localize } from "../runtime";
import { escapeHTML } from "../utils/miscUtils";
import { mergeObject } from "@tabbletop/common";

export interface ApplicationV1Options {
  baseApplication: string | null;
  id: string;
  classes: string[];
  title: string;
  template: string | null;
  popOut: boolean;
  minimizable: boolean;
  resizable: boolean;
  width: number | null;
  height: number | "auto" | null;
  top: number | null;
  left: number | null;
  scale: number | null;
  tabs: unknown[];
  dragDrop: unknown[];
  filters: unknown[];
  scrollY: string[];
  [extra: string]: any;
}

interface HeaderButton {
  label: string;
  class: string;
  icon: string;
  onclick: (event: Event) => unknown;
}

const RENDER_STATES = Object.freeze({ CLOSING: -2, CLOSED: -1, NONE: 0, RENDERING: 1, RENDERED: 2, ERROR: 3 });

export class Application {
  static RENDER_STATES = RENDER_STATES;
  static #nextAppId = 1;

  static get defaultOptions(): ApplicationV1Options {
    return {
      baseApplication: null,
      id: "",
      classes: [],
      title: "",
      template: null,
      popOut: true,
      minimizable: true,
      resizable: false,
      width: null,
      height: null,
      top: null,
      left: null,
      scale: null,
      tabs: [],
      dragDrop: [],
      filters: [],
      scrollY: [],
    };
  }

  /** Yields this class and its Application ancestors, most-derived first. */
  static *_getInheritanceChain(): Generator<typeof Application> {
    yield* inheritanceChainOf(this, Application) as Iterable<typeof Application>;
  }

  readonly appId: number;
  options: ApplicationV1Options;
  position: { width: number | null; height: number | "auto" | null; left: number | null; top: number | null; scale: number | null; zIndex?: number };
  _state: number = RENDER_STATES.NONE;
  _element: JQuery | null = null;

  constructor(options: Partial<ApplicationV1Options> = {}) {
    this.options = mergeObject((this.constructor as typeof Application).defaultOptions, options, { inplace: false });
    this.appId = Application.#nextAppId++;
    this.position = { width: this.options.width, height: this.options.height, left: this.options.left, top: this.options.top, scale: this.options.scale };
    const ui = currentUi();
    if (ui) ui.windows[this.appId] = this;
  }

  get id(): string {
    return this.options.id ? this.options.id : `app-${this.appId}`;
  }

  get element(): JQuery {
    return this._element ?? $(`[data-appid="${this.appId}"]`);
  }

  get template(): string | null {
    return this.options.template;
  }

  get popOut(): boolean {
    return this.options.popOut;
  }

  get rendered(): boolean {
    return this._state === RENDER_STATES.RENDERED;
  }

  get title(): string {
    return localize(this.options.title);
  }

  async getData(_options: object = {}): Promise<object> {
    return { cssClass: this.options.classes.join(" "), options: this.options };
  }

  render(force = false, options: Record<string, unknown> = {}): this {
    this._render(force, options).catch((error) => {
      this._state = RENDER_STATES.ERROR;
      Hooks.onError("Application#render", error, { msg: `An error occurred while rendering ${this.constructor.name} ${this.appId}`, log: "error" });
    });
    return this;
  }

  async _render(force = false, options: Record<string, unknown> = {}): Promise<void> {
    if (!force && !this.rendered) return;
    if (this._state === RENDER_STATES.RENDERING) return;
    const wasRendered = this.rendered && this._element !== null;
    this._state = RENDER_STATES.RENDERING;

    const data = await this.getData(this.options);
    const inner = await this._renderInner(data, options);
    if (wasRendered && this._element) {
      this._replaceHTML(this._element, inner);
    } else {
      this._element = await this._renderOuter();
      this._injectHTML(this.popOut ? this._element : inner);
      if (this.popOut) this._element.find(".window-content").append(inner);
      else this._element = inner;
      this._activateCoreListeners(inner);
    }
    this.activateListeners(inner);
    this._state = RENDER_STATES.RENDERED;
    if (this.popOut) this.setPosition(this.position);
    this._callHooks((className) => `render${className}`, inner, data);
  }

  async _renderInner(data: object, _options?: object): Promise<JQuery> {
    if (!this.template) throw new Error(`No template defined for application ${this.constructor.name}`);
    const html = await renderTemplate(this.template, data);
    return $(html.trim());
  }

  async _renderOuter(): Promise<JQuery> {
    const classes = ["app", "window-app", ...this.options.classes].map(escapeHTML).join(" ");
    const windowElement = $(
      `<div id="${escapeHTML(this.id)}" class="${classes}" data-appid="${this.appId}">` +
        `<header class="window-header flexrow"><h4 class="window-title">${escapeHTML(this.title)}</h4></header>` +
        `<section class="window-content"></section></div>`,
    );
    const header = windowElement.find(".window-header");
    for (const button of this._getHeaderButtons()) {
      const link = $(`<a class="header-button ${escapeHTML(button.class)}"><i class="${escapeHTML(button.icon)}"></i>${escapeHTML(localize(button.label))}</a>`);
      link.on("click", (event) => {
        event.preventDefault();
        button.onclick(event.originalEvent as Event);
      });
      header.append(link);
    }
    this._makeDraggable(windowElement);
    return windowElement;
  }

  _injectHTML(html: JQuery): void {
    $("body").append(html);
  }

  _replaceHTML(element: JQuery, html: JQuery): void {
    if (this.popOut) element.find(".window-content").empty().append(html);
    else {
      element.replaceWith(html);
      this._element = html;
    }
  }

  _getHeaderButtons(): HeaderButton[] {
    const buttons: HeaderButton[] = [{ label: "Close", class: "close", icon: "fas fa-times", onclick: () => void this.close() }];
    for (const constructor of inheritanceChainOf(this.constructor, Application)) {
      if (constructor.name) Hooks.call(`get${constructor.name}HeaderButtons`, this, buttons);
    }
    return buttons;
  }

  _activateCoreListeners(_html: JQuery): void {
    this._element?.on("pointerdown", () => this.bringToTop());
  }

  activateListeners(_html: JQuery): void {}

  setPosition({ left, top, width, height, scale }: Partial<Application["position"]> = {}): Application["position"] | void {
    if (!this.popOut || !this._element) return;
    const element = this._element[0] as HTMLElement;
    const nextWidth = width ?? this.position.width;
    if (typeof nextWidth === "number") element.style.width = `${nextWidth}px`;
    const nextHeight = height ?? this.position.height;
    element.style.height = typeof nextHeight === "number" ? `${nextHeight}px` : "auto";

    const bounds = element.getBoundingClientRect();
    this.position.left = left ?? this.position.left ?? Math.max(0, (window.innerWidth - bounds.width) / 2);
    this.position.top = top ?? this.position.top ?? Math.max(0, (window.innerHeight - bounds.height) / 3);
    this.position.width = typeof nextWidth === "number" ? nextWidth : bounds.width;
    this.position.height = nextHeight ?? "auto";
    this.position.scale = scale ?? this.position.scale;
    this.position.zIndex ??= nextZIndex();
    Object.assign(element.style, { position: "fixed", left: `${this.position.left}px`, top: `${this.position.top}px`, zIndex: String(this.position.zIndex) });
    return this.position;
  }

  bringToTop(): void {
    this.position.zIndex = nextZIndex();
    if (this._element?.[0]) (this._element[0] as HTMLElement).style.zIndex = String(this.position.zIndex);
  }

  async close(_options: object = {}): Promise<void> {
    if (this._state <= RENDER_STATES.NONE || !this._element) return;
    this._state = RENDER_STATES.CLOSING;
    const element = this._element;
    this._callHooks((className) => `close${className}`, element);
    element.remove();
    this._element = null;
    this._state = RENDER_STATES.CLOSED;
    const ui = currentUi();
    if (ui) delete ui.windows[this.appId];
  }

  minimize(): Promise<void> {
    return Promise.resolve();
  }

  maximize(): Promise<void> {
    return Promise.resolve();
  }

  _callHooks(hookNameFor: (className: string) => string, ...hookArgs: unknown[]): void {
    for (const constructor of inheritanceChainOf(this.constructor, Application)) {
      if (constructor.name) Hooks.callAll(hookNameFor(constructor.name), this, ...hookArgs);
    }
  }

  _makeDraggable(windowElement: JQuery): void {
    windowElement.find(".window-header").on("pointerdown", (downEvent) => {
      if ((downEvent.target as HTMLElement).closest("a, button")) return;
      const startLeft = this.position.left ?? 0;
      const startTop = this.position.top ?? 0;
      const onMove = (moveEvent: PointerEvent) =>
        this.setPosition({ left: startLeft + moveEvent.clientX - (downEvent.clientX ?? 0), top: Math.max(0, startTop + moveEvent.clientY - (downEvent.clientY ?? 0)) });
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }
}
