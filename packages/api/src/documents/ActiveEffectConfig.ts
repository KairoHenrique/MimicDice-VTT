import type { PlainObject } from "@tabbletop/common";
import type { ApplicationConfiguration } from "../applications/ApplicationV2";
import type { FormDataExtended } from "../applications/FormDataExtended";
import { CONST } from "../constants";
import { DocumentSheetV2 } from "./sheets";

interface EffectChangeSource {
  key: string;
  value: string;
  mode: number;
  priority: number | null;
}

const MODE_LABELS: Record<number, string> = {
  [CONST.ACTIVE_EFFECT_MODES.CUSTOM]: "Personalizado",
  [CONST.ACTIVE_EFFECT_MODES.MULTIPLY]: "Multiplicar",
  [CONST.ACTIVE_EFFECT_MODES.ADD]: "Somar",
  [CONST.ACTIVE_EFFECT_MODES.DOWNGRADE]: "Reduzir para",
  [CONST.ACTIVE_EFFECT_MODES.UPGRADE]: "Aumentar para",
  [CONST.ACTIVE_EFFECT_MODES.OVERRIDE]: "Substituir",
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, value);
  if (text !== undefined) created.textContent = text;
  return created;
}

function formGroup(label: string, field: HTMLElement): HTMLElement {
  const group = element("div", { class: "form-group" });
  const fields = element("div", { class: "form-fields" });
  fields.append(field);
  group.append(element("label", {}, label), fields);
  return group;
}

function textInput(name: string, value: string, disabled: boolean): HTMLInputElement {
  const input = element("input", { type: "text", name });
  input.value = value;
  input.disabled = disabled;
  return input;
}

function checkbox(name: string, checked: boolean, disabled: boolean): HTMLInputElement {
  const input = element("input", { type: "checkbox", name });
  input.checked = checked;
  input.disabled = disabled;
  return input;
}

function modeSelect(name: string, mode: number, disabled: boolean): HTMLSelectElement {
  const select = element("select", { name, "data-dtype": "Number" });
  for (const [value, label] of Object.entries(MODE_LABELS)) {
    const option = element("option", { value }, label);
    option.selected = Number(value) === mode;
    select.append(option);
  }
  select.disabled = disabled;
  return select;
}

function changesFromForm(raw: unknown): EffectChangeSource[] {
  const rows = Array.isArray(raw) ? raw : Object.values((raw ?? {}) as PlainObject);
  return rows.map((row: any) => ({
    key: String(row?.key ?? "").trim(),
    value: String(row?.value ?? ""),
    mode: Number(row?.mode ?? CONST.ACTIVE_EFFECT_MODES.ADD),
    priority: row?.priority === "" || row?.priority === undefined || row?.priority === null ? null : Number(row.priority),
  }));
}

async function addChange(this: ActiveEffectConfig): Promise<void> {
  const changes = [...(this.document._source.changes ?? []), { key: "", value: "", mode: CONST.ACTIVE_EFFECT_MODES.ADD, priority: null }];
  await this.document.update({ changes });
}

async function deleteChange(this: ActiveEffectConfig, _event: PointerEvent, target: HTMLElement): Promise<void> {
  const index = Number(target.closest<HTMLElement>("[data-index]")?.dataset.index);
  if (!Number.isInteger(index)) return;
  const changes = (this.document._source.changes ?? []).filter((_: unknown, position: number) => position !== index);
  await this.document.update({ changes });
}

/** Core Active Effect sheet with the "details" and "changes" sections that systems decorate through render hooks. */
export class ActiveEffectConfig extends DocumentSheetV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["active-effect-config"],
    position: { width: 560 },
    window: { resizable: true, controls: [] } as unknown as ApplicationConfiguration["window"],    actions: { addChange: addChange as never, deleteChange: deleteChange as never },
  };

  override async _renderHTML(): Promise<Node[]> {
    const editable = this.isEditable;
    const footer = element("footer", { class: "form-footer" });
    return [this.#buildDetails(editable), this.#buildChanges(editable), footer];
  }

  override _replaceHTML(result: Node[], content: HTMLElement): void {
    content.replaceChildren(...result);
  }

  override _prepareSubmitData(event: Event, form: HTMLFormElement, formData: FormDataExtended): PlainObject {
    const submitData = super._prepareSubmitData(event, form, formData);
    if ("changes" in submitData) submitData.changes = changesFromForm(submitData.changes);
    return submitData;
  }

  #buildDetails(editable: boolean): HTMLElement {
    const section = element("section", { class: "tab", "data-tab": "details" });
    const source = this.document._source;
    const description = element("textarea", { name: "description", rows: "3" });
    description.value = source.description ?? "";
    description.disabled = !editable;
    section.append(
      formGroup("Nome", textInput("name", source.name ?? "", !editable)),
      formGroup("Ícone", textInput("img", source.img ?? "", !editable)),
      formGroup("Desativado", checkbox("disabled", Boolean(source.disabled), !editable)),
      formGroup("Transferir para o ator", checkbox("transfer", source.transfer !== false, !editable)),
      formGroup("Descrição", description),
    );
    return section;
  }

  #buildChanges(editable: boolean): HTMLElement {
    const section = element("section", { class: "tab", "data-tab": "changes" });
    const header = element("header", { class: "effect-change-header" });
    header.append(element("span", {}, "Atributo"), element("span", {}, "Modo"), element("span", {}, "Valor"), element("span", {}, "Prioridade"));
    if (editable) header.append(element("button", { type: "button", "data-action": "addChange", title: "Adicionar mudança" }, "+"));
    const list = element("ol", { class: "changes-list" });
    const changes: EffectChangeSource[] = this.document._source.changes ?? [];
    changes.forEach((change, index) => list.append(this.#buildChangeRow(change, index, editable)));
    section.append(header, list);
    return section;
  }

  #buildChangeRow(change: EffectChangeSource, index: number, editable: boolean): HTMLElement {
    const row = element("li", { class: "effect-change", "data-index": String(index) });
    const prefix = `changes.${index}`;
    const keyCell = element("div", { class: "key" });
    keyCell.append(textInput(`${prefix}.key`, change.key ?? "", !editable));
    const modeCell = element("div", { class: "mode" });
    modeCell.append(modeSelect(`${prefix}.mode`, change.mode, !editable));
    const valueCell = element("div", { class: "value" });
    valueCell.append(textInput(`${prefix}.value`, change.value ?? "", !editable));
    const priorityCell = element("div", { class: "priority" });
    priorityCell.append(textInput(`${prefix}.priority`, change.priority === null || change.priority === undefined ? "" : String(change.priority), !editable));
    row.append(keyCell, modeCell, valueCell, priorityCell);
    if (editable) row.append(element("button", { type: "button", "data-action": "deleteChange", title: "Remover mudança" }, "x"));
    return row;
  }
}
