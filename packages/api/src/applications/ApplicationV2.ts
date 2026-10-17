import { Hooks } from "../hooks/Hooks";
import { localize } from "../runtime";
import { deepClone, mergeObject } from "@tabbletop/common";
import { applicationInstances, inheritanceChainOf, nextZIndex } from "./applicationRegistry";
import { FormDataExtended } from "./FormDataExtended";
import { popOutElement, type PoppedOutWindow } from "./popOutWindow";

type ActionHandler = (this: ApplicationV2, event: PointerEvent, target: HTMLElement) => unknown;
type ActionConfig = ActionHandler | { handler: ActionHandler; buttons?: number[] };

export interface ApplicationPosition {
  top?: number;
  left?: number;
  width?: number | "auto";
  height?: number | "auto";
  scale?: number;
  zIndex?: number;
}

export interface ApplicationConfiguration {
  id: string;
  uniqueId: string;
  classes: string[];
  tag: string;
  window: {
    frame: boolean;
    positioned: boolean;
    title: string;
    icon: string | false;
    controls: unknown[];
    minimizable: boolean;
    resizable: boolean;
    contentTag: string;
    contentClasses: string[];
    /** Shows the header button that moves the window out of the table, e.g. to a second monitor. */
    popOut?: boolean;
  };
  actions: Record<string, ActionConfig>;
  form?: { handler?: Function; submitOnChange?: boolean; closeOnSubmit?: boolean };
  position: ApplicationPosition;
  [extra: string]: any;
}

export interface RenderOptions {
  force?: boolean;
  position?: ApplicationPosition;
  window?: { title?: string };
  isFirstRender?: boolean;
  parts?: string[];
  [extra: string]: any;
}

const MIN_WINDOW_WIDTH = 240;
const MIN_WINDOW_HEIGHT = 120;
const RENDER_STATES = Object.freeze({ ERROR: -3, CLOSING: -2, CLOSED: -1, NONE: 0, RENDERING: 1, RENDERED: 2 });

export class ApplicationV2 extends EventTarget {
  static BASE_APPLICATION = ApplicationV2;
  static RENDER_STATES = RENDER_STATES;
  static emittedEvents = Object.freeze(["render", "close", "position"]);
  static #nextUniqueId = 1;

  static DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "app-{id}",
    classes: [],
    tag: "div",
    window: { frame: true, positioned: true, title: "", icon: false, controls: [], minimizable: true, resizable: true, contentTag: "section", contentClasses: [] },
    actions: {},
    position: {},
  };

  static *inheritanceChain(): Generator<Function> {
    yield* inheritanceChainOf(this, ApplicationV2);
  }

  readonly options: Readonly<ApplicationConfiguration>;
  position: ApplicationPosition;
  state: number = RENDER_STATES.NONE;
  #element: HTMLElement | undefined;
  #content: HTMLElement | undefined;
  #windowElements: { header?: HTMLElement; title?: HTMLElement; close?: HTMLElement; popOut?: HTMLElement; content?: HTMLElement } = {};
  #renderQueue: Promise<unknown> = Promise.resolve();
  #poppedOut: PoppedOutWindow | null = null;

  constructor(options: Partial<ApplicationConfiguration> = {}) {
    super();
    const configuration = this._initializeApplicationOptions(options);
    this.options = Object.freeze(configuration);
    this.position = { ...configuration.position };
  }

  _initializeApplicationOptions(options: Partial<ApplicationConfiguration>): ApplicationConfiguration {
    const chain = Array.from((this.constructor as typeof ApplicationV2).inheritanceChain()).reverse();
    const merged = {} as ApplicationConfiguration;
    const classes: string[] = [];
    for (const constructor of chain) {
      if (!Object.prototype.hasOwnProperty.call(constructor, "DEFAULT_OPTIONS")) continue;
      const defaults = (constructor as typeof ApplicationV2).DEFAULT_OPTIONS;
      classes.push(...(defaults.classes ?? []));
      mergeObject(merged, deepClone({ ...defaults, classes: [] }));
    }
    classes.push(...(options.classes ?? []));
    mergeObject(merged, { ...options, classes: [] });
    merged.classes = Array.from(new Set(classes));
    merged.uniqueId = String(ApplicationV2.#nextUniqueId++);
    merged.id = (merged.id ?? "app-{id}").replace("{id}", merged.uniqueId);
    merged.actions = { ...merged.actions };
    return merged;
  }

  get id(): string {
    return this.options.id;
  }

  get element(): HTMLElement {
    return this.#element as HTMLElement;
  }

  get form(): HTMLFormElement | null {
    return this.#element instanceof HTMLFormElement ? this.#element : null;
  }

  get window() {
    return this.#windowElements;
  }

  get title(): string {
    return localize(this.options.window.title);
  }

  get rendered(): boolean {
    return this.state === RENDER_STATES.RENDERED;
  }

  get hasFrame(): boolean {
    return this.options.window.frame;
  }

  get isPoppedOut(): boolean {
    return this.#poppedOut !== null;
  }

  get #canPopOut(): boolean {
    return this.hasFrame && this.options.window.positioned && this.options.window.popOut !== false;
  }

  get classList(): DOMTokenList | undefined {
    return this.#element?.classList;
  }

  render(options: RenderOptions | boolean = {}, legacyOptions: RenderOptions = {}): Promise<this> {
    const renderOptions: RenderOptions = typeof options === "boolean" ? { ...legacyOptions, force: options } : options;
    const pending = this.#renderQueue.then(() => this.#render(renderOptions));
    this.#renderQueue = pending.catch(() => undefined);
    return pending;
  }

  async #render(options: RenderOptions): Promise<this> {
    if (!options.force && this.state !== RENDER_STATES.RENDERED) return this;
    this._configureRenderOptions(options);
    const previousState = this.state;
    this.state = RENDER_STATES.RENDERING;
    try {
      const context = await this._prepareContext(options);
      if (options.isFirstRender) await this._preFirstRender(context, options);
      await this._preRender(context, options);
      const result = await this._renderHTML(context, options);
      if (!options.isFirstRender && !this.#element) return this;
      if (options.isFirstRender) this.#mountFrame(options);
      else if (this.#windowElements.title) this.#windowElements.title.textContent = this.title;
      this._replaceHTML(result, this.#content as HTMLElement, options);
      this.state = RENDER_STATES.RENDERED;
      if (options.isFirstRender) await this._onFirstRender(context, options);
      await this._onRender(context, options);
      this.setPosition(options.position);
      this.#callHooks("render", [this.#element, context, options]);
    } catch (error) {
      this.state = previousState === RENDER_STATES.RENDERED ? previousState : RENDER_STATES.ERROR;
      Hooks.onError("ApplicationV2#render", error, { msg: `Failed to render ${this.constructor.name}`, log: "error", notify: "error" });
    }
    return this;
  }

  _configureRenderOptions(options: RenderOptions): void {
    options.isFirstRender = this.state <= RENDER_STATES.NONE || !this.#element;
    if (options.isFirstRender) options.position = { ...this.position, ...options.position };
    if (options.window?.title !== undefined) (this.options.window as { title: string }).title = options.window.title;
  }

  async _prepareContext(_options: RenderOptions): Promise<Record<string, unknown>> {
    return {};
  }

  async _preFirstRender(_context: object, _options: RenderOptions): Promise<void> {}

  async _onFirstRender(_context: object, _options: RenderOptions): Promise<void> {}

  async _preRender(_context: object, _options: RenderOptions): Promise<void> {}

  async _onRender(_context: object, _options: RenderOptions): Promise<void> {}

  async _renderHTML(_context: object, _options: RenderOptions): Promise<unknown> {
    throw new Error("The ApplicationV2 subclass must implement _renderHTML");
  }

  _replaceHTML(_result: unknown, _content: HTMLElement, _options: RenderOptions): void {
    throw new Error("The ApplicationV2 subclass must implement _replaceHTML");
  }

  _renderFrame(_options: RenderOptions): HTMLElement {
    const frame = document.createElement(this.options.tag);
    frame.id = this.id;
    frame.classList.add("application", ...this.options.classes);
    if (this.hasFrame) frame.classList.add("themed");
    if (!this.hasFrame) return frame;

    const header = document.createElement("header");
    header.className = "window-header";
    const title = document.createElement("h1");
    title.className = "window-title";
    title.textContent = this.title;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "header-control icon fa-solid fa-xmark";
    closeButton.dataset.action = "close";
    closeButton.setAttribute("aria-label", localize("Close"));
    const popOutButton = this.#canPopOut ? this.#renderPopOutButton() : undefined;
    header.append(title, ...(popOutButton ? [popOutButton] : []), closeButton);

    const content = document.createElement(this.options.window.contentTag);
    content.className = ["window-content", ...this.options.window.contentClasses].join(" ");
    frame.append(header, content);
    this.#windowElements = { header, title, close: closeButton, popOut: popOutButton, content };
    return frame;
  }

  #renderPopOutButton(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "header-control icon fa-solid fa-up-right-from-square";
    button.dataset.action = "popOut";
    this.#syncPopOutButton(button);
    return button;
  }

  #syncPopOutButton(button = this.#windowElements.popOut): void {
    if (!button) return;
    const label = localize(this.#poppedOut ? "Trazer de volta para a mesa" : "Abrir em janela separada (outro monitor)");
    button.title = label;
    button.setAttribute("aria-label", label);
    button.classList.toggle("fa-up-right-from-square", !this.#poppedOut);
    button.classList.toggle("fa-down-left-and-up-right-to-center", Boolean(this.#poppedOut));
  }

  /** Moves this window into a separate OS window (to drag to another monitor), or brings it back. */
  togglePopOut(): void {
    if (this.#poppedOut) {
      this.#poppedOut.close();
      return;
    }
    if (!this.#element || !this.#canPopOut) return;
    this.#poppedOut = popOutElement(this.#element, {
      name: `mimicdice-${this.id}`,
      title: this.title,
      onReturn: () => {
        this.#poppedOut = null;
        this.#syncPopOutButton();
        if (this.state === RENDER_STATES.RENDERED) this.setPosition();
      },
    });
    this.#syncPopOutButton();
  }

  #mountFrame(options: RenderOptions): void {
    this.#element = this._renderFrame(options);
    this.#content = this.hasFrame ? this.#windowElements.content : this.#element;
    this.#element.addEventListener("click", (event) => this.#onClickAction(event as PointerEvent));
    if (this.#element instanceof HTMLFormElement) this.#element.addEventListener("submit", (event) => void this.#onSubmitForm(event));
    if (this.hasFrame) this.#makeDraggable();
    if (this.hasFrame && this.options.window.positioned && this.options.window.resizable) this.#makeResizable();
    this._insertElement(this.#element);
    applicationInstances.set(this.id, this);
  }

  _insertElement(element: HTMLElement): void {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else document.body.append(element);
  }

  setPosition(position: ApplicationPosition = {}): ApplicationPosition {
    if (!this.#element || !this.options.window.positioned || this.#poppedOut) return this.position;
    Object.assign(this.position, position);
    const style = this.#element.style;
    style.position = "fixed";
    if (typeof this.position.width === "number") style.width = `${this.position.width}px`;
    if (typeof this.position.height === "number") style.height = `${this.position.height}px`;
    const bounds = this.#element.getBoundingClientRect();
    this.position.left ??= Math.max(0, (window.innerWidth - bounds.width) / 2);
    this.position.top ??= Math.max(0, (window.innerHeight - bounds.height) / 3);
    style.left = `${this.position.left}px`;
    style.top = `${this.position.top}px`;
    this.position.zIndex ??= nextZIndex();
    style.zIndex = String(this.position.zIndex);
    return this.position;
  }

  bringToFront(): void {
    this.position.zIndex = nextZIndex();
    if (this.#element) this.#element.style.zIndex = String(this.position.zIndex);
  }

  async close(options: { animate?: boolean } = {}): Promise<this> {
    if (!this.#element || this.state === RENDER_STATES.CLOSED) return this;
    this.state = RENDER_STATES.CLOSING;
    this._preClose(options);
    this.#element.remove();
    this.#poppedOut?.close();
    this.#poppedOut = null;
    this.state = RENDER_STATES.CLOSED;
    applicationInstances.delete(this.id);
    this.#element = undefined;
    this._onClose(options);
    this.#callHooks("close", []);
    return this;
  }

  _preClose(_options: object): void {}

  _onClose(_options: object): void {}

  async submit(): Promise<void> {
    if (this.form) await this.#onSubmitForm(new SubmitEvent("submit", { cancelable: true }));
  }

  #onClickAction(event: PointerEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target || !this.#element?.contains(target)) return;
    const actionName = target.dataset.action as string;
    if (actionName === "close") {
      event.preventDefault();
      void this.close();
      return;
    }
    if (actionName === "popOut") {
      event.preventDefault();
      this.togglePopOut();
      return;
    }
    const configured = this.options.actions[actionName];
    if (!configured) return;
    const handler = typeof configured === "function" ? configured : configured.handler;
    try {
      const outcome = handler.call(this, event, target);
      if (outcome instanceof Promise) outcome.catch((error) => Hooks.onError(`${this.constructor.name}#${actionName}`, error, { log: "error", notify: "error" }));
    } catch (error) {
      Hooks.onError(`${this.constructor.name}#${actionName}`, error, { log: "error", notify: "error" });
    }
  }

  async #onSubmitForm(event: Event): Promise<void> {
    event.preventDefault();
    const formConfig = this.options.form;
    const form = this.form;
    if (!formConfig?.handler || !form) return;
    await formConfig.handler.call(this, event, form, new FormDataExtended(form));
    if (formConfig.closeOnSubmit) await this.close();
  }

  #makeDraggable(): void {
    const header = this.#windowElements.header;
    if (!header) return;
    header.addEventListener("pointerdown", (downEvent) => {
      if ((downEvent.target as HTMLElement).closest("button, a, input")) return;
      this.bringToFront();
      const startLeft = this.position.left ?? 0;
      const startTop = this.position.top ?? 0;
      const onMove = (moveEvent: PointerEvent) => {
        this.setPosition({ left: startLeft + moveEvent.clientX - downEvent.clientX, top: Math.max(0, startTop + moveEvent.clientY - downEvent.clientY) });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  #makeResizable(): void {
    const frame = this.#element;
    if (!frame) return;
    const handle = document.createElement("div");
    handle.className = "window-resize-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.title = "Arraste para redimensionar";
    frame.append(handle);
    handle.addEventListener("pointerdown", (downEvent) => {
      downEvent.preventDefault();
      downEvent.stopPropagation();
      this.bringToFront();
      const start = frame.getBoundingClientRect();
      frame.style.maxHeight = "none";
      const onMove = (moveEvent: PointerEvent) => {
        const width = Math.min(window.innerWidth - start.left, Math.max(MIN_WINDOW_WIDTH, start.width + moveEvent.clientX - downEvent.clientX));
        const height = Math.min(window.innerHeight - start.top, Math.max(MIN_WINDOW_HEIGHT, start.height + moveEvent.clientY - downEvent.clientY));
        this.setPosition({ width, height });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  #callHooks(eventName: "render" | "close", hookArgs: unknown[]): void {
    for (const constructor of (this.constructor as typeof ApplicationV2).inheritanceChain()) {
      if (!constructor.name) continue;
      Hooks.callAll(`${eventName}${constructor.name}`, this, ...hookArgs);
    }
    this.dispatchEvent(new Event(eventName));
  }
}
