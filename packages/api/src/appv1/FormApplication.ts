import { FilePicker } from "../applications/apps/FilePicker";
import { FormDataExtended } from "../applications/FormDataExtended";
import type { RichTextEditor } from "../applications/ux/RichTextEditor";
import { TextEditor } from "../applications/ux/TextEditor";
import { Hooks } from "../hooks/Hooks";
import { getProperty, mergeObject } from "@tabbletop/common";
import { Application, type ApplicationV1Options } from "./Application";

export interface FormEditorState {
  target: string;
  element: HTMLElement;
  button: HTMLElement | null;
  hasButton: boolean;
  active: boolean;
  changed: boolean;
  instance: RichTextEditor | null;
  initial: string;
}

export interface FormApplicationOptions extends ApplicationV1Options {
  closeOnSubmit: boolean;
  submitOnChange: boolean;
  submitOnClose: boolean;
  editable: boolean;
  sheetConfig: boolean;
}

export class FormApplication extends Application {
  static override get defaultOptions(): FormApplicationOptions {
    return mergeObject(super.defaultOptions, {
      classes: ["form"],
      closeOnSubmit: true,
      submitOnChange: false,
      submitOnClose: false,
      editable: true,
      sheetConfig: false,
    }) as FormApplicationOptions;
  }

  declare options: FormApplicationOptions;
  object: any;
  form: HTMLFormElement | null = null;
  editors: Record<string, FormEditorState> = {};
  #submitting = false;

  constructor(object: unknown = {}, options: Partial<FormApplicationOptions> = {}) {
    super(options);
    this.object = object;
  }

  get isEditable(): boolean {
    return this.options.editable;
  }

  override async getData(options: object = {}): Promise<object> {
    return { object: this.object, options: this.options, title: this.title, editable: this.isEditable, cssClass: this.isEditable ? "editable" : "locked" };
  }

  override async _renderInner(data: object, options?: object): Promise<JQuery> {
    let html = await super._renderInner(data, options);
    let form = html.filter("form")[0] ?? html.find("form")[0];
    if (!form) {
      html = $("<form></form>").append(html);
      form = html[0];
    }
    this.form = form as HTMLFormElement;
    return html;
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);
    if (!this.form) return;
    this.form.addEventListener("submit", (event) => void this._onSubmit(event));
    if (this.options.submitOnChange) this.form.addEventListener("change", (event) => void this._onChangeInput(event));
    if (!this.isEditable) return;
    this.form.querySelectorAll<HTMLButtonElement>("button.file-picker").forEach((button) => button.addEventListener("click", (event) => this._activateFilePicker(event)));
    this.form.querySelectorAll<HTMLElement>(".editor-content[data-edit]").forEach((content) => this._activateEditor(content));
  }

  _activateFilePicker(event: Event): void {
    event.preventDefault();
    void FilePicker.fromButton(event.currentTarget as HTMLElement).render(true);
  }

  _activateEditor(content: HTMLElement): void {
    const name = content.dataset.edit as string;
    const container = content.closest<HTMLElement>(".editor") ?? content;
    const button = container.querySelector<HTMLElement>(".editor-edit");
    this.editors[name] = { target: name, element: content, button, hasButton: Boolean(button), active: false, changed: false, instance: null, initial: getProperty(this.object?._source ?? this.object, name) ?? "" };
    if (button) button.addEventListener("click", (event) => {
      event.preventDefault();
      void this.activateEditor(name);
    });
    else void this.activateEditor(name);
  }

  async activateEditor(name: string, options: Record<string, unknown> = {}, initialContent?: string): Promise<RichTextEditor | null> {
    const editor = this.editors[name];
    if (!editor || editor.active) return editor?.instance ?? null;
    const host = editor.element.closest<HTMLElement>(".editor") ?? editor.element;
    editor.button?.remove();
    editor.active = true;
    editor.instance = await TextEditor.implementation.create(
      { ...options, target: host, onSave: () => this.saveEditor(name) },
      String(initialContent ?? editor.initial ?? ""),
    );
    return editor.instance;
  }

  async saveEditor(name: string, { remove = true }: { remove?: boolean } = {}): Promise<void> {
    const editor = this.editors[name];
    if (!editor?.instance) return;
    const html = editor.instance.getHTML();
    editor.changed = html !== editor.initial;
    if (remove) {
      editor.instance.destroy();
      editor.active = false;
      editor.instance = null;
    }
    await this._onSubmit(new Event("submit", { cancelable: true }), { updateData: { [name]: html }, preventClose: true });
  }

  async _onChangeInput(event: Event): Promise<void> {
    if (this.options.submitOnChange) await this._onSubmit(event, { preventClose: true });
  }

  _getSubmitData(updateData: object = {}): Record<string, unknown> {
    if (!this.form) throw new Error("The FormApplication subclass has no registered form element");
    const formData = new FormDataExtended(this.form).object;
    return mergeObject(formData as Record<string, unknown>, updateData);
  }

  async _onSubmit(event: Event, { updateData = {}, preventClose = false, preventRender = false }: { updateData?: object; preventClose?: boolean; preventRender?: boolean } = {}): Promise<Record<string, unknown> | false> {
    event.preventDefault();
    if (!this.rendered || !this.isEditable || this.#submitting) return false;
    this.#submitting = true;
    try {
      const submitData = this._getSubmitData(updateData);
      await this._updateObject(event, submitData);
      if (this.options.closeOnSubmit && !preventClose) await this.close({ submit: false });
      else if (!preventRender) this.render();
      return submitData;
    } catch (error) {
      Hooks.onError("FormApplication#_onSubmit", error, { log: "error", notify: "error" });
      return false;
    } finally {
      this.#submitting = false;
    }
  }

  async _updateObject(_event: Event, _formData: Record<string, unknown>): Promise<unknown> {
    throw new Error("A subclass of the FormApplication must implement the _updateObject method.");
  }

  async submit(options: { updateData?: object; preventClose?: boolean; preventRender?: boolean } = {}): Promise<this> {
    await this._onSubmit(new Event("submit", { cancelable: true }), options);
    return this;
  }

  override async close(options: { submit?: boolean } = {}): Promise<void> {
    if (this.options.submitOnClose && options.submit !== false) await this.submit({ preventClose: true, preventRender: true });
    await super.close(options);
    this.form = null;
  }
}
