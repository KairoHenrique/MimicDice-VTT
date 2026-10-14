import type { SettingConfig } from "@tabbletop/api";
import { h } from "../../views/dom";

const CORE_GROUP = "core";

/** Only settings the user may actually change are listed: world settings belong to the GM. */
function isEditableByCurrentUser(setting: SettingConfig): boolean {
  if (!setting.config) return false;
  if (game.user.isGM) return true;
  return setting.scope !== "world" && setting.restricted !== true;
}

function groupLabel(namespace: string): string {
  if (namespace === CORE_GROUP) return "Mesa";
  if (game.system?.id === namespace) return game.system.title ?? namespace;
  return game.modules.get(namespace)?.title ?? namespace;
}

function localize(text: string | undefined): string {
  return text ? String(game.i18n.localize(text)) : "";
}

async function saveSetting(setting: SettingConfig, value: unknown): Promise<void> {
  try {
    await game.settings.set(setting.namespace, setting.key, value);
    if (setting.requiresReload) ui.notifications.info("Recarregue a página (F5) para aplicar essa mudança.");
  } catch (error) {
    ui.notifications.error(error instanceof Error ? error.message : "Não foi possível salvar.");
  }
}

function choiceInput(setting: SettingConfig, current: unknown): HTMLSelectElement {
  const select = h("select", {}, ...Object.entries(setting.choices ?? {}).map(([value, label]) => h("option", { value, selected: String(current) === value }, localize(label))));
  select.addEventListener("change", () => void saveSetting(setting, setting.type === Number ? Number(select.value) : select.value));
  return select;
}

function numberInput(setting: SettingConfig, current: unknown): HTMLElement {
  const range = setting.range;
  const input = h("input", { type: range ? "range" : "number", value: String(current ?? ""), min: range?.min, max: range?.max, step: range?.step ?? "any" });
  const output = h("output", {}, String(current ?? ""));
  input.addEventListener("input", () => {
    output.textContent = input.value;
  });
  input.addEventListener("change", () => {
    const value = Number(input.value);
    if (Number.isFinite(value)) void saveSetting(setting, value);
  });
  return range ? h("span", { class: "setting-range" }, input, output) : input;
}

function settingInput(setting: SettingConfig): HTMLElement | null {
  const current = game.settings.get(setting.namespace, setting.key);
  if (setting.choices) return choiceInput(setting, current);
  if (setting.type === Boolean) {
    const checkbox = h("input", { type: "checkbox", checked: current === true });
    checkbox.addEventListener("change", () => void saveSetting(setting, checkbox.checked));
    return checkbox;
  }
  if (setting.type === Number) return numberInput(setting, current);
  if (setting.type === String) {
    const input = h("input", { type: "text", value: String(current ?? ""), maxlength: 500 });
    input.addEventListener("change", () => void saveSetting(setting, input.value));
    return input;
  }
  return null;
}

function settingRow(setting: SettingConfig): HTMLElement | null {
  const input = settingInput(setting);
  if (!input) return null;
  const hint = localize(setting.hint);
  return h(
    "div",
    { class: "config-row" },
    h("div", { class: "config-label" }, h("strong", {}, localize(setting.name) || setting.key), hint ? h("p", { class: "hint" }, hint) : null),
    h("div", { class: "config-control" }, input),
  );
}

export function buildSettingsTab(): HTMLElement {
  const groups = new Map<string, HTMLElement[]>();
  for (const setting of game.settings.settings.values() as Iterable<SettingConfig>) {
    if (!isEditableByCurrentUser(setting)) continue;
    const row = settingRow(setting);
    if (!row) continue;
    const rows = groups.get(setting.namespace) ?? [];
    rows.push(row);
    groups.set(setting.namespace, rows);
  }
  if (groups.size === 0) return h("p", { class: "hint" }, "Nada para configurar aqui.");
  const ordered = [...groups].sort(([left], [right]) => Number(right === CORE_GROUP) - Number(left === CORE_GROUP) || groupLabel(left).localeCompare(groupLabel(right)));
  return h("div", { class: "config-groups" }, ...ordered.map(([namespace, rows]) => h("section", { class: "config-group" }, h("h3", {}, groupLabel(namespace)), ...rows)));
}
