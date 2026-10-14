import { DOCUMENT_OWNERSHIP_LEVELS, getProperty, mergeObject, type PlainObject } from "@tabbletop/common";
import { ApplicationV2, type ApplicationConfiguration, type RenderOptions } from "../applications/ApplicationV2";
import { dataPathToUrl, FilePicker } from "../applications/apps/FilePicker";
import type { FormDataExtended } from "../applications/FormDataExtended";
import { FormApplication, type FormApplicationOptions } from "../appv1/FormApplication";
import { currentGame, currentUi, localize } from "../runtime";

function sheetIdFor(sheetClassName: string, document: { uuid: string }): string {
  return `${sheetClassName}-${document.uuid.replaceAll(".", "-")}`;
}

async function submitDocumentForm(this: DocumentSheetV2, event: Event, form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
  if (!this.isEditable) return;
  const submitData = this._prepareSubmitData(event, form, formData);
  await this._processSubmitData(event, form, submitData);
}

export class DocumentSheetV2 extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "{id}",
    classes: ["sheet"],
    tag: "form",
    viewPermission: DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
    editPermission: DOCUMENT_OWNERSHIP_LEVELS.OWNER,
    canCreate: false,
    sheetConfig: true,
    form: { handler: submitDocumentForm, submitOnChange: true, closeOnSubmit: false },
    actions: { editImage: editDocumentImage as never },
    window: { resizable: true } as ApplicationConfiguration["window"],
    position: { width: 520 },
  };

  override _initializeApplicationOptions(options: Partial<ApplicationConfiguration>): ApplicationConfiguration {
    const { document, ...rest } = options as Partial<ApplicationConfiguration> & { document?: any };
    if (!document) throw new Error(`${this.constructor.name} requires a document option`);
    const configuration = super._initializeApplicationOptions(rest);
    configuration.document = document;
    configuration.id = sheetIdFor(this.constructor.name, document);
    return configuration;
  }

  get document(): any {
    return this.options.document;
  }

  override get title(): string {
    const label = localize(this.document.constructor.metadata?.label ?? this.document.documentName);
    const typeLabel = label.startsWith("DOCUMENT.") ? this.document.documentName : label;
    return `${typeLabel}: ${this.document.name ?? this.document.id}`;
  }

  get isVisible(): boolean {
    return this.document.testUserPermission(currentGame()?.user, this.options.viewPermission);
  }

  get isEditable(): boolean {
    const user = currentGame()?.user;
    if (this.document.testUserPermission(user, this.options.editPermission)) return true;
    return this.options.editPermission === DOCUMENT_OWNERSHIP_LEVELS.OWNER && Boolean(this.document.canEditSheet?.(user));
  }

  override render(options: RenderOptions | boolean = {}, legacyOptions: RenderOptions = {}): Promise<this> {
    const wantsForce = typeof options === "boolean" ? options : options.force;
    if (wantsForce && !this.isVisible) {
      currentUi()?.notifications?.warn("Você não tem permissão para ver esta ficha.");
      return Promise.resolve(this);
    }
    return super.render(options, legacyOptions);
  }

  override async _prepareContext(options: RenderOptions): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    return {
      ...context,
      document: this.document,
      source: this.document._source,
      fields: this.document.schema.fields,
      editable: this.isEditable,
      user: currentGame()?.user,
      rootId: this.id,
    };
  }

  override async _onFirstRender(context: object, options: RenderOptions): Promise<void> {
    await super._onFirstRender(context, options);
    this.document.apps[this.id] = this;
    if (this.options.form?.submitOnChange) {
      this.element.addEventListener("change", () => void this.submit());
    }
  }

  override _onClose(options: object): void {
    super._onClose(options);
    delete this.document.apps[this.id];
  }

  _prepareSubmitData(_event: Event, _form: HTMLFormElement, formData: FormDataExtended): PlainObject {
    return formData.object as PlainObject;
  }

  async _processSubmitData(_event: Event, _form: HTMLFormElement, submitData: PlainObject): Promise<void> {
    await this.document.update(submitData);
  }
}

export class ActorSheetV2 extends DocumentSheetV2 {
  get actor(): any {
    return this.document;
  }
}

export class ItemSheetV2 extends DocumentSheetV2 {
  get item(): any {
    return this.document;
  }

  get actor(): any {
    return this.document.actor;
  }
}

export interface DocumentSheetOptions extends FormApplicationOptions {
  viewPermission: number;
}

export class DocumentSheet extends FormApplication {
  static override get defaultOptions(): DocumentSheetOptions {
    return mergeObject(super.defaultOptions, {
      classes: ["sheet"],
      template: `templates/sheets/${this.name.toLowerCase()}.html`,
      viewPermission: DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
      sheetConfig: true,
      closeOnSubmit: false,
      submitOnClose: true,
      submitOnChange: true,
    }) as DocumentSheetOptions;
  }

  declare options: DocumentSheetOptions;

  get document(): any {
    return this.object;
  }

  override get id(): string {
    return sheetIdFor(this.constructor.name, this.document);
  }

  override get title(): string {
    return this.document.name ?? this.document.id;
  }

  override get isEditable(): boolean {
    return this.options.editable && Boolean(this.document.canEditSheet?.() ?? this.document.isOwner);
  }

  override async getData(options: object = {}): Promise<object> {
    const base = await super.getData(options);
    return {
      ...base,
      document: this.document,
      data: this.document.toObject(false),
      limited: this.document.limited,
      owner: this.document.isOwner,
      editable: this.isEditable,
      cssClass: this.isEditable ? "editable" : "locked",
    };
  }

  override render(force = false, options: Record<string, unknown> = {}): this {
    if (force && !this.document.testUserPermission(currentGame()?.user, this.options.viewPermission)) return this;
    this.document.apps[this.appId] = this;
    return super.render(force, options);
  }

  override async close(options: { submit?: boolean } = {}): Promise<void> {
    await super.close(options);
    delete this.document.apps[this.appId];
  }

  override async _updateObject(_event: Event, formData: Record<string, unknown>): Promise<unknown> {
    return this.document.update(formData);
  }

  override activateListeners(html: JQuery): void {
    super.activateListeners(html);
    if (!this.isEditable) return;
    this.form?.querySelectorAll<HTMLImageElement>("img[data-edit]").forEach((image) => image.addEventListener("click", (event) => this._onEditImage(event)));
  }

  _onEditImage(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    const attribute = image.dataset.edit as string;
    openImagePicker(getProperty(this.document._source, attribute), image, (path) => this._onSubmit(event, { updateData: { [attribute]: path }, preventClose: true }));
  }
}

function openImagePicker(current: unknown, image: HTMLImageElement, apply: (path: string) => unknown): void {
  const picker = new FilePicker.implementation({
    type: "image",
    current: typeof current === "string" ? current : "",
    callback: (path) => {
      image.src = dataPathToUrl(path);
      return apply(path);
    },
  });
  void picker.render({ force: true });
}

async function editDocumentImage(this: DocumentSheetV2, _event: PointerEvent, target: HTMLElement): Promise<void> {
  if (!this.isEditable) return;
  const attribute = target.dataset.edit ?? "img";
  const image = target instanceof HTMLImageElement ? target : (target.querySelector("img") ?? document.createElement("img"));
  openImagePicker(getProperty(this.document._source, attribute), image, (path) => this.document.update({ [attribute]: path }));
}

export class ActorSheet extends DocumentSheet {
  static override get defaultOptions(): DocumentSheetOptions {
    return mergeObject(super.defaultOptions, { template: "templates/sheets/actor-sheet.html", width: 600, height: 680 }) as DocumentSheetOptions;
  }

  get actor(): any {
    return this.object;
  }
}

export class ItemSheet extends DocumentSheet {
  static override get defaultOptions(): DocumentSheetOptions {
    return mergeObject(super.defaultOptions, { template: "templates/sheets/item-sheet.html", width: 500, height: 400 }) as DocumentSheetOptions;
  }

  get item(): any {
    return this.object;
  }

  get actor(): any {
    return this.item.actor;
  }
}

export class JournalSheet extends DocumentSheet {}
