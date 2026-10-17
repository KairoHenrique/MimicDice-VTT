import { localize } from "../runtime";
import { escapeHTML } from "../utils/miscUtils";
import { Hooks } from "../hooks/Hooks";
import { ApplicationV2, type ApplicationConfiguration, type RenderOptions } from "./ApplicationV2";
import { FormDataExtended } from "./FormDataExtended";

interface DialogButton {
  action: string;
  label: string;
  icon?: string;
  default?: boolean;
  callback?: (event: Event, button: HTMLButtonElement, dialog: DialogV2) => unknown;
}

interface DialogConfiguration extends Omit<Partial<ApplicationConfiguration>, "window"> {
  window?: Partial<ApplicationConfiguration["window"]>;
  content?: string | HTMLElement;
  buttons?: DialogButton[];
  submit?: (result: unknown, dialog: DialogV2) => unknown;
  rejectClose?: boolean;
  modal?: boolean;
}

type ShortcutConfiguration = DialogConfiguration & { yes?: Partial<DialogButton>; no?: Partial<DialogButton>; ok?: Partial<DialogButton> };

export class DialogV2 extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "dialog-{id}",
    classes: ["dialog"],
    tag: "dialog",
    window: { title: "", frame: true, positioned: true, icon: false, controls: [], minimizable: false, resizable: true, contentTag: "form", contentClasses: ["dialog-form"], popOut: false },
    position: { width: 400 },
  };

  readonly dialogOptions: DialogConfiguration;
  #settled = false;

  constructor(options: DialogConfiguration = {}) {
    super(options as Partial<ApplicationConfiguration>);
    this.dialogOptions = options;
  }

  override async _renderHTML(): Promise<HTMLElement[]> {
    const content = document.createElement("div");
    content.className = "dialog-content standard-form";
    const configuredContent = this.dialogOptions.content ?? "";
    if (configuredContent instanceof HTMLElement) content.append(configuredContent);
    else content.innerHTML = configuredContent;

    const footer = document.createElement("footer");
    footer.className = "form-footer";
    for (const button of this.dialogOptions.buttons ?? []) {
      const element = document.createElement("button");
      element.type = "button";
      element.dataset.action = button.action;
      element.className = button.default ? "default" : "";
      element.innerHTML = `${button.icon ? `<i class="${escapeHTML(button.icon)}"></i> ` : ""}<span>${escapeHTML(localize(button.label))}</span>`;
      element.addEventListener("click", (event) => void this.#onButton(event, element, button));
      footer.append(element);
    }
    return [content, footer];
  }

  override _replaceHTML(result: HTMLElement[], content: HTMLElement): void {
    content.replaceChildren(...result);
    content.querySelector<HTMLButtonElement>("button.default")?.focus();
  }

  override get form(): HTMLFormElement | null {
    return (this.element as HTMLElement | null)?.querySelector("form") ?? null;
  }

  /** The root is a `<dialog>` like Foundry's, shown non-modally so it shares stacking with other windows. */
  override _insertElement(element: HTMLElement): void {
    super._insertElement(element);
    element.setAttribute("open", "");
  }

  /** Enter inside the form presses the default button instead of submitting the page. */
  override async _onFirstRender(context: object, options: RenderOptions): Promise<void> {
    await super._onFirstRender(context, options);
    const form = this.element?.querySelector("form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      form.querySelector<HTMLButtonElement>("button.default")?.click();
    });
  }

  override async close(options: object = {}): Promise<this> {
    if (!this.#settled) {
      this.#settled = true;
      await this.dialogOptions.submit?.(null, this);
    }
    return super.close(options);
  }

  /** A failing package callback is reported and the dialog closes as dismissed, so the UI never gets stuck open. */
  async #onButton(event: Event, element: HTMLButtonElement, button: DialogButton): Promise<void> {
    event.preventDefault();
    let result: unknown = null;
    try {
      result = button.callback ? await button.callback(event, element, this) : button.action;
    } catch (error) {
      Hooks.onError("DialogV2#onButton", error, { log: "error" });
      await this.close();
      return;
    }
    this.#settled = true;
    await this.dialogOptions.submit?.(result, this);
    await this.close();
  }

  static async wait(configuration: DialogConfiguration = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const dialog = new this({
        ...configuration,
        submit: async (result: unknown, instance: DialogV2) => {
          if (result === null && configuration.rejectClose) reject(new Error("Dialog was dismissed without making a choice."));
          else resolve(result);
          await configuration.submit?.(result, instance);
        },
      });
      void dialog.render({ force: true });
    });
  }

  static async confirm({ yes = {}, no = {}, ...configuration }: ShortcutConfiguration = {}): Promise<unknown> {
    return this.wait({
      ...configuration,
      buttons: [
        { action: "yes", label: "Yes", icon: "fa-solid fa-check", callback: () => true, default: true, ...yes } as DialogButton,
        { action: "no", label: "No", icon: "fa-solid fa-xmark", callback: () => false, ...no } as DialogButton,
      ],
    });
  }

  /** Prompt whose result is the dialog's form data as an object, or null when dismissed. */
  static async input({ ok = {}, ...configuration }: ShortcutConfiguration = {}): Promise<unknown> {
    return this.prompt({
      ...configuration,
      ok: {
        ...ok,
        callback: (event: Event, button: HTMLButtonElement, dialog: DialogV2) => {
          const form = button.form ?? dialog.form;
          return form ? new FormDataExtended(form).object : {};
        },
      },
    });
  }

  static async prompt({ ok = {}, ...configuration }: ShortcutConfiguration = {}): Promise<unknown> {
    return this.wait({
      ...configuration,
      buttons: [{ action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true, ...ok } as DialogButton],
    });
  }
}
