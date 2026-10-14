import type { PlainObject } from "@tabbletop/common";
import { DialogV2 } from "../../applications/DialogV2";
import { TypeDataModel } from "../../data/DataModel";
import { Hooks } from "../../hooks/Hooks";
import { currentGame, localize } from "../../runtime";
import { escapeHTML } from "../../utils/miscUtils";
import type { Document, DocumentOperation } from "./Document";
import { DocumentSheetConfig } from "./DocumentSheetConfig";

type DocumentConstructor = abstract new (...args: any[]) => Document;

function formatLocalized(key: string, data: Record<string, string>): string {
  const game = currentGame();
  return game?.i18n?.format ? game.i18n.format(key, data) : key;
}

function documentTypeLabel(documentClass: { documentName: string; metadata: { label: string } }): string {
  const label = localize(documentClass.metadata.label);
  return label === documentClass.metadata.label ? documentClass.documentName : label;
}

export function ClientDocumentMixin<TBase extends DocumentConstructor>(BaseDocument: TBase) {
  abstract class ClientDocument extends BaseDocument {
    declare apps: Record<string, any>;
    declare _sheet: any;

    constructor(...args: any[]) {
      super(...args);
      Object.defineProperty(this, "apps", { value: {}, writable: true, enumerable: false });
      Object.defineProperty(this, "_sheet", { value: null, writable: true, enumerable: false });
    }

    get visible(): boolean {
      if (this.isEmbedded) return this.parent.visible;
      return this.testUserPermission(currentGame()?.user, "LIMITED");
    }

    get sheet(): any {
      if (this._sheet) return this._sheet;
      const sheetClass = DocumentSheetConfig.getSheetClass(this);
      if (!sheetClass) return null;
      this._sheet = DocumentSheetConfig.isApplicationV2(sheetClass) ? new sheetClass({ document: this }) : new sheetClass(this, {});
      return this._sheet;
    }

    get link(): string {
      return `@UUID[${this.uuid}]{${this.name ?? this.id}}`;
    }

    override _initialize(options: object = {}): void {
      super._initialize(options);
      if (currentGame()?._documentsReady) this._safePrepareData();
    }

    _safePrepareData(): void {
      try {
        this.prepareData();
      } catch (error) {
        Hooks.onError(`${this.documentName}#prepareData`, error, { msg: `Failed data preparation for ${this.uuid}`, log: "error" });
      }
    }

    prepareData(): void {
      const systemModel = this.system instanceof TypeDataModel ? this.system : null;
      systemModel?.prepareBaseData();
      this.prepareBaseData();
      this.prepareEmbeddedDocuments();
      systemModel?.prepareDerivedData();
      this.prepareDerivedData();
    }

    prepareBaseData(): void {}

    prepareEmbeddedDocuments(): void {
      for (const collection of Object.values(this.collections ?? {})) {
        for (const document of collection.values()) document._safePrepareData();
      }
    }

    prepareDerivedData(): void {}

    render(force = false, options: object = {}): void {
      for (const app of Object.values(this.apps)) app?.render?.(force, options);
    }

    toDragData(): PlainObject {
      return { type: this.documentName, uuid: this.uuid };
    }

    getRollData(): PlainObject {
      return this.system ?? {};
    }

    override _onCreate(data: PlainObject, options: DocumentOperation, userId: string): void {
      super._onCreate(data, options, userId);
      if (options.renderSheet && userId === currentGame()?.userId) this.sheet?.render(true);
    }

    override _onUpdate(changed: PlainObject, options: DocumentOperation, userId: string): void {
      super._onUpdate(changed, options, userId);
      if (options.render !== false) this.render(false, { action: "update", data: changed });
    }

    override _onDelete(options: DocumentOperation, userId: string): void {
      super._onDelete(options, userId);
      for (const app of Object.values(this.apps)) void app?.close?.({ submit: false });
      this._sheet = null;
    }

    override _onCreateDescendantDocuments(...args: Parameters<Document["_onCreateDescendantDocuments"]>): void {
      super._onCreateDescendantDocuments(...args);
      this.render(false);
    }

    override _onUpdateDescendantDocuments(...args: Parameters<Document["_onUpdateDescendantDocuments"]>): void {
      super._onUpdateDescendantDocuments(...args);
      this.render(false);
    }

    override _onDeleteDescendantDocuments(...args: Parameters<Document["_onDeleteDescendantDocuments"]>): void {
      super._onDeleteDescendantDocuments(...args);
      this.render(false);
    }

    static defaultName({ type, parent }: { type?: string; parent?: Document | null } = {}): string {
      const documentClass = this as unknown as typeof Document;
      const typeLabelKey = type ? (globalThis as any).CONFIG?.[documentClass.documentName]?.typeLabels?.[type] : undefined;
      const label = typeLabelKey ? localize(typeLabelKey) : documentTypeLabel(documentClass);
      const siblings = parent ? parent.getEmbeddedCollection(documentClass.documentName) : currentGame()?.collections?.get(documentClass.documentName);
      const count = siblings?.size ?? 0;
      const formatted = formatLocalized("DOCUMENT.New", { type: label });
      const baseName = formatted === "DOCUMENT.New" ? `${label}` : formatted;
      return count > 0 ? `${baseName} (${count + 1})` : baseName;
    }

    static async createDialog(data: PlainObject = {}, createOptions: DocumentOperation = {}, { types, ...dialogOptions }: { types?: string[]; [key: string]: unknown } = {}): Promise<Document | null> {
      const documentClass = this as unknown as typeof Document & { defaultName(context: object): string };
      const availableTypes = (types ?? documentClass.TYPES).filter((type) => type !== "base" || documentClass.TYPES.length === 1);
      const form = buildCreateForm(documentClass, availableTypes, data);
      const result = await DialogV2.prompt({
        window: { title: `Criar ${documentTypeLabel(documentClass)}` } as any,
        content: form,
        ok: { label: "Criar", callback: () => readCreateForm(form) },
        ...dialogOptions,
      });
      if (!result || typeof result !== "object") return null;
      const { name, type } = result as { name: string; type: string };
      const createData: PlainObject = { ...data, name: name || documentClass.defaultName({ type, parent: createOptions.parent }) };
      if (documentClass.hasTypeData) createData.type = type;
      return documentClass.create(createData, { renderSheet: true, ...createOptions });
    }

    async deleteDialog(options: Record<string, unknown> = {}): Promise<this | false | undefined> {
      const confirmed = await DialogV2.confirm({
        window: { title: `Excluir ${this.name ?? this.documentName}` } as any,
        content: `<p>Excluir <strong>${escapeHTML(String(this.name ?? this.id))}</strong>? Essa ação não pode ser desfeita.</p>`,
        ...options,
      });
      return confirmed === true ? this.delete() : false;
    }
  }
  return ClientDocument;
}

function buildCreateForm(documentClass: typeof Document, types: string[], data: PlainObject): HTMLElement {
  const container = document.createElement("div");
  const nameGroup = document.createElement("div");
  nameGroup.className = "form-group";
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Nome";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.name = "name";
  nameInput.value = typeof data.name === "string" ? data.name : "";
  nameInput.placeholder = (documentClass as any).defaultName?.({}) ?? "";
  nameGroup.append(nameLabel, nameInput);
  container.append(nameGroup);
  if (!documentClass.hasTypeData || types.length === 0) return container;

  const typeGroup = document.createElement("div");
  typeGroup.className = "form-group";
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Tipo";
  const typeSelect = document.createElement("select");
  typeSelect.name = "type";
  const typeLabels = (globalThis as any).CONFIG?.[documentClass.documentName]?.typeLabels ?? {};
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = typeLabels[type] ? localize(typeLabels[type]) : type;
    option.selected = data.type === type;
    typeSelect.append(option);
  }
  typeGroup.append(typeLabel, typeSelect);
  container.append(typeGroup);
  return container;
}

function readCreateForm(form: HTMLElement): { name: string; type: string } {
  const name = form.querySelector<HTMLInputElement>("input[name=name]")?.value.trim() ?? "";
  const type = form.querySelector<HTMLSelectElement>("select[name=type]")?.value ?? "base";
  return { name, type };
}
