import { localize } from "../runtime";
import { escapeHTML } from "../utils/miscUtils";
import { mergeObject } from "@tabbletop/common";
import { Application, type ApplicationV1Options } from "./Application";

interface DialogButtonV1 {
  icon?: string;
  label: string;
  condition?: boolean;
  callback?: (html: JQuery, event?: Event) => unknown;
}

interface DialogData {
  title: string;
  content: string;
  buttons: Record<string, DialogButtonV1>;
  default?: string;
  render?: (html: JQuery) => void;
  close?: (html: JQuery) => unknown;
}

type ConfirmConfiguration = { title?: string; content?: string; yes?: (html: JQuery) => unknown; no?: (html: JQuery) => unknown; defaultYes?: boolean; rejectClose?: boolean; options?: Partial<ApplicationV1Options> };
type PromptConfiguration = { title?: string; content?: string; label?: string; callback?: (html: JQuery) => unknown; rejectClose?: boolean; options?: Partial<ApplicationV1Options> };

export class Dialog extends Application {
  static override get defaultOptions(): ApplicationV1Options {
    return mergeObject(super.defaultOptions, { classes: ["dialog"], width: 400, jQuery: true });
  }

  data: DialogData;
  #settled = false;

  constructor(data: DialogData, options: Partial<ApplicationV1Options> = {}) {
    super(options);
    this.data = data;
  }

  override get title(): string {
    return localize(this.data.title || "Dialog");
  }

  override async _renderInner(): Promise<JQuery> {
    const buttons = Object.entries(this.data.buttons ?? {})
      .filter(([, button]) => button.condition !== false)
      .map(([key, button]) => {
        const isDefault = key === this.data.default ? " default" : "";
        return `<button class="dialog-button ${escapeHTML(key)}${isDefault}" data-button="${escapeHTML(key)}">${button.icon ?? ""} ${escapeHTML(localize(button.label))}</button>`;
      })
      .join("");
    return $(`<div class="dialog-content">${this.data.content ?? ""}</div><div class="dialog-buttons">${buttons}</div>`);
  }

  override activateListeners(html: JQuery): void {
    html.find(".dialog-button").on("click", (event) => {
      event.preventDefault();
      const key = (event.currentTarget as HTMLElement).dataset.button as string;
      this.submit(this.data.buttons[key], event.originalEvent as Event);
    });
    this.data.render?.(html);
  }

  submit(button: DialogButtonV1 | undefined, event?: Event): void {
    if (!button) return;
    try {
      button.callback?.(this.element, event);
      this.#settled = true;
      void this.close();
    } catch (error) {
      console.error(error);
    }
  }

  override async close(options: object = {}): Promise<void> {
    if (!this.#settled) {
      this.#settled = true;
      this.data.close?.(this.element);
    }
    await super.close(options);
  }

  static async confirm({ title = "Confirm", content = "", yes, no, defaultYes = true, rejectClose = false, options = {} }: ConfirmConfiguration = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      new this(
        {
          title,
          content,
          buttons: {
            yes: { icon: '<i class="fas fa-check"></i>', label: "Yes", callback: (html) => resolve(yes ? yes(html) : true) },
            no: { icon: '<i class="fas fa-times"></i>', label: "No", callback: (html) => resolve(no ? no(html) : false) },
          },
          default: defaultYes ? "yes" : "no",
          close: () => (rejectClose ? reject(new Error("The confirmation Dialog was closed without a choice being made.")) : resolve(null)),
        },
        options,
      ).render(true);
    });
  }

  static async prompt({ title = "Confirm", content = "", label = "Confirm", callback, rejectClose = true, options = {} }: PromptConfiguration = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      new this(
        {
          title,
          content,
          buttons: { ok: { icon: '<i class="fas fa-check"></i>', label, callback: (html) => resolve(callback ? callback(html) : undefined) } },
          default: "ok",
          close: () => (rejectClose ? reject(new Error("The Dialog prompt was closed without being accepted.")) : resolve(null)),
        },
        options,
      ).render(true);
    });
  }

  static async wait(data: DialogData, options: Partial<ApplicationV1Options> = {}): Promise<unknown> {
    return new Promise((resolve) => {
      const buttons = Object.fromEntries(
        Object.entries(data.buttons).map(([key, button]) => [key, { ...button, callback: (html: JQuery, event?: Event) => resolve(button.callback ? button.callback(html, event) : key) }]),
      );
      new this({ ...data, buttons, close: (html) => resolve(data.close ? data.close(html) : null) }, options).render(true);
    });
  }
}
