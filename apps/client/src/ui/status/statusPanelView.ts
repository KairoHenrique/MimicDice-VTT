import { STATUS_PANEL_MODES, type StatusPanelMode, type StatusPanelState, type StatusResource } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { actorRole, ROLE_PRESENTATION } from "../actors/actorRoles";
import { applyEffectDialog } from "../effects/applyEffectDialog";
import { actorEffects } from "../effects/effectStore";
import { effectChipRow } from "../effects/effectVisuals";
import { clampNumber } from "../sheets/layout/sheetLayoutRules";
import { STATUS_PANEL_MODE_LABELS, updateStatusPanelState } from "./statusPanelState";
import { readActorResources, type ResourceReading } from "./statusReadings";
import { editedMax, editedValue, resourceUpdate, steppedValue, type ResourceEdit } from "./statusValueEditing";

function stepButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = h("button", { type: "button", class: "icon status-step", title: label, "aria-label": label }, h("i", { class: icon, "aria-hidden": "true" }));
  button.addEventListener("click", onClick);
  return button;
}

function saveEdit(actor: any, reading: ResourceReading, edit: ResourceEdit): void {
  if (edit.value === reading.value && edit.max === reading.max) return;
  void actor.update(resourceUpdate(reading, edit)).catch(() => ui.notifications.warn("Não foi possível alterar o valor."));
}

/** Typing commits on Enter or when leaving the field; the field shows the value actually saved (clamped). */
function numberField(label: string, current: number, onCommit: (typed: number) => ResourceEdit, pick: (edit: ResourceEdit) => number, editKey: string): HTMLInputElement {
  const input = h("input", { type: "number", class: "status-number", value: String(current), step: 1, inputmode: "numeric", "aria-label": label, title: label, "data-edit-key": editKey });
  input.addEventListener("change", () => {
    const typed = Number(input.value);
    if (input.value.trim() === "" || !Number.isFinite(typed)) {
      input.value = String(current);
      return;
    }
    input.value = String(pick(onCommit(typed)));
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  return input;
}

function barMeter(reading: ResourceReading): HTMLElement {
  const span = reading.max - reading.min;
  const percent = span > 0 ? clampNumber(((reading.value - reading.min) / span) * 100, 0, 100) : 0;
  return h(
    "div",
    { class: "status-bar", role: "meter", "aria-label": reading.label, "aria-valuenow": reading.value, "aria-valuemin": reading.min, "aria-valuemax": Math.max(reading.max, reading.min), title: `${reading.label}: ${reading.value} / ${reading.max}` },
    h("div", { class: "status-bar-fill", style: `width:${percent}%;background:${reading.resource.color}` }),
  );
}

function ownerControls(actor: any, reading: ResourceReading): HTMLElement {
  const commit = (edit: ResourceEdit) => {
    saveEdit(actor, reading, edit);
    return edit;
  };
  const baseKey = `${actor.id}:${reading.resource.id}`;
  const valueInput = numberField(`${reading.label} atual de ${actor.name}`, reading.value, (typed) => commit(editedValue(reading, typed)), (edit) => edit.value, `${baseKey}:value`);
  const controls = h(
    "div",
    { class: "status-values" },
    stepButton("fa-solid fa-minus", `Diminuir ${reading.label} de ${actor.name}`, () => saveEdit(actor, reading, steppedValue(reading, -1))),
    valueInput,
  );
  if (reading.kind === "bar") {
    const maximum = game.user.isGM
      ? numberField(`${reading.label} máximo de ${actor.name}`, reading.max, (typed) => commit(editedMax(reading, typed)), (edit) => edit.max, `${baseKey}:max`)
      : h("span", { class: "status-readonly", title: "Só o mestre muda o máximo" }, String(reading.max));
    controls.append(h("span", { class: "status-separator", "aria-hidden": "true" }, "/"), maximum);
  }
  controls.append(stepButton("fa-solid fa-plus", `Aumentar ${reading.label} de ${actor.name}`, () => saveEdit(actor, reading, steppedValue(reading, 1))));
  return controls;
}

function buildReading(actor: any, reading: ResourceReading): HTMLElement {
  const readOnlyValue = reading.kind === "bar" ? `${reading.value}/${reading.max}` : String(reading.value);
  const values = actor.isOwner ? ownerControls(actor, reading) : h("span", { class: "status-readonly" }, readOnlyValue);
  const row = h("div", { class: `status-row status-kind-${reading.kind}` }, h("span", { class: "status-label", style: `--status-color:${reading.resource.color}` }, reading.label), values);
  if (reading.kind === "bar") row.append(barMeter(reading));
  return row;
}

export function buildActorCard(actor: any, resources: readonly StatusResource[]): HTMLElement {
  const readings = readActorResources(actor, resources);
  const name = h("button", { type: "button", class: "status-name", title: `Abrir a ficha de ${actor.name}` }, actor.name || "Sem nome");
  name.addEventListener("click", () => actor.sheet?.render(true));
  const portrait = actor.img ? h("img", { class: "status-portrait", src: actor.img, alt: "", loading: "lazy" }) : null;
  const body = readings.length > 0 ? readings.map((reading) => buildReading(actor, reading)) : [h("p", { class: "status-empty hint" }, "A ficha não tem essas barras.")];
  const header = h("div", { class: "status-card-header" }, portrait, name, effectsButton(actor));
  return h("li", { class: "status-card", "data-actor-id": actor.id }, header, effectChipRow(actorEffects(actor), "status-effects"), ...body);
}

function effectsButton(actor: any): HTMLElement | null {
  if (!game.user.isGM) return null;
  const label = `Aplicar ou tirar efeito de ${actor.name}`;
  const button = h("button", { type: "button", class: "icon status-step status-effect-button", title: label, "aria-label": label }, h("i", { class: "fa-solid fa-wand-magic-sparkles", "aria-hidden": "true" }));
  button.addEventListener("click", () => void applyEffectDialog([actor]));
  return button;
}

function modeSelect(state: StatusPanelState): HTMLElement {
  const select = h(
    "select",
    { "aria-label": "Quem aparece no painel" },
    ...STATUS_PANEL_MODES.map((mode) => h("option", { value: mode, selected: mode === state.mode }, STATUS_PANEL_MODE_LABELS[mode])),
  );
  select.addEventListener("change", () => void updateStatusPanelState({ mode: select.value as StatusPanelMode }));
  return h("label", { class: "status-picker-mode" }, h("span", {}, "Mostrar"), select);
}

function actorCheckbox(actor: any, picked: Set<string>): HTMLElement {
  const checkbox = h("input", { type: "checkbox", checked: picked.has(actor.id) });
  checkbox.addEventListener("change", () => {
    const next = new Set(picked);
    if (checkbox.checked) next.add(actor.id);
    else next.delete(actor.id);
    void updateStatusPanelState({ actorIds: Array.from(next) });
  });
  return h("label", { class: "status-picker-actor" }, checkbox, h("span", {}, actor.name || "Sem nome"));
}

function customList(state: StatusPanelState, filter: string): HTMLElement {
  const picked = new Set(state.actorIds);
  const needle = filter.trim().toLocaleLowerCase("pt-BR");
  const actors: any[] = (game.actors?.contents ?? []).filter((actor: any) => !needle || String(actor.name ?? "").toLocaleLowerCase("pt-BR").includes(needle));
  const groups = (["player", "enemy", "npc"] as const).map((role) => {
    const members = actors.filter((actor) => actorRole(actor) === role);
    if (members.length === 0) return null;
    return h("fieldset", { class: "status-picker-group" }, h("legend", {}, ROLE_PRESENTATION[role].plural), ...members.map((actor) => actorCheckbox(actor, picked)));
  });
  return h("div", { class: "status-picker-list" }, ...groups);
}

/** GM only: choose which characters the panel lists (players, combat, scene, or picked one by one). */
export function buildPicker(state: StatusPanelState, filter: string, onFilter: (text: string) => void): HTMLElement {
  const picker = h("div", { class: "status-picker" }, modeSelect(state));
  if (state.mode !== "custom") return picker;
  const search = h("input", { type: "search", value: filter, placeholder: "Buscar personagem", maxlength: 64, "aria-label": "Buscar personagem" });
  let list = customList(state, filter);
  search.addEventListener("input", () => {
    onFilter(search.value);
    const next = customList(state, search.value);
    list.replaceWith(next);
    list = next;
  });
  picker.append(search, list);
  return picker;
}
