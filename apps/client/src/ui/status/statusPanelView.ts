import { STATUS_PANEL_MODES, type StatusPanelMode, type StatusPanelState, type StatusResource } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { actorRole, ROLE_PRESENTATION } from "../actors/actorRoles";
import { clampNumber } from "../sheets/layout/sheetLayoutRules";
import { STATUS_PANEL_MODE_LABELS, updateStatusPanelState } from "./statusPanelState";
import { readActorResources, type ResourceReading } from "./statusReadings";

function stepButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = h("button", { type: "button", class: "icon status-step", title: label, "aria-label": label }, h("i", { class: icon, "aria-hidden": "true" }));
  button.addEventListener("click", onClick);
  return button;
}

function changeResource(actor: any, reading: ResourceReading, delta: number): void {
  const value = clampNumber(reading.value + delta, reading.min, reading.max);
  if (value === reading.value) return;
  void actor.update({ [reading.path]: { value, max: reading.max } }).catch(() => ui.notifications.warn("Não foi possível alterar o valor."));
}

function buildBar(actor: any, reading: ResourceReading): HTMLElement {
  const span = reading.max - reading.min;
  const percent = span > 0 ? clampNumber(((reading.value - reading.min) / span) * 100, 0, 100) : 0;
  const description = `${reading.label}: ${reading.value} de ${reading.max} (mínimo ${reading.min})`;
  const bar = h(
    "div",
    { class: "status-bar", role: "meter", "aria-label": reading.label, "aria-valuenow": reading.value, "aria-valuemin": reading.min, "aria-valuemax": reading.max, title: description },
    h("div", { class: "status-bar-fill", style: `width:${percent}%;background:${reading.resource.color}` }),
    h("span", { class: "status-bar-text" }, `${reading.label} ${reading.value}/${reading.max}`),
  );
  if (!actor.isOwner) return h("div", { class: "status-row" }, bar);
  return h(
    "div",
    { class: "status-row" },
    stepButton("fa-solid fa-minus", `Diminuir ${reading.label} de ${actor.name}`, () => changeResource(actor, reading, -1)),
    bar,
    stepButton("fa-solid fa-plus", `Aumentar ${reading.label} de ${actor.name}`, () => changeResource(actor, reading, 1)),
  );
}

export function buildActorCard(actor: any, resources: readonly StatusResource[]): HTMLElement {
  const readings = readActorResources(actor, resources);
  const name = h("button", { type: "button", class: "status-name", title: `Abrir a ficha de ${actor.name}` }, actor.name || "Sem nome");
  name.addEventListener("click", () => actor.sheet?.render(true));
  const portrait = actor.img ? h("img", { class: "status-portrait", src: actor.img, alt: "", loading: "lazy" }) : null;
  const body = readings.length > 0 ? readings.map((reading) => buildBar(actor, reading)) : [h("p", { class: "status-empty hint" }, "A ficha não tem essas barras.")];
  return h("li", { class: "status-card", "data-actor-id": actor.id }, h("div", { class: "status-card-header" }, portrait, name), ...body);
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
