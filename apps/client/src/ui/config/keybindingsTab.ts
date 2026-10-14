import type { KeyBinding } from "@tabbletop/api";
import { h } from "../../views/dom";
import { bindingLabel, bindingSignature, MODIFIER_KEY_CODES, modifiersHeld } from "./keyLabels";

const CAPTURE_ATTRIBUTE = "data-capturing-keybinding";

interface KeybindingEntry {
  id: string;
  namespace: string;
  action: string;
  name: string;
  hint: string;
  bindings: KeyBinding[];
}

function localize(text: unknown): string {
  return typeof text === "string" && text ? String(game.i18n.localize(text)) : "";
}

function listEntries(): KeybindingEntry[] {
  const entries: KeybindingEntry[] = [];
  for (const [id, action] of game.keybindings.actions as Map<string, any>) {
    if (action.restricted && !game.user.isGM) continue;
    const separator = id.indexOf(".");
    entries.push({ id, namespace: id.slice(0, separator), action: id.slice(separator + 1), name: localize(action.name) || id, hint: localize(action.hint), bindings: action.editable ?? [] });
  }
  return entries;
}

function usedBy(binding: KeyBinding, exceptId: string): string | null {
  const signature = bindingSignature(binding);
  for (const entry of listEntries()) {
    if (entry.id !== exceptId && entry.bindings.some((candidate) => bindingSignature(candidate) === signature)) return entry.name;
  }
  return null;
}

/**
 * Waits for the next key press. A modifier pressed and released alone becomes the binding itself,
 * so keys like Ctrl can be used as a "hold" key.
 */
function captureBinding(host: HTMLElement): Promise<KeyBinding | null> {
  return new Promise((resolve) => {
    let pendingModifier: string | null = null;
    const finish = (binding: KeyBinding | null) => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      host.removeAttribute(CAPTURE_ATTRIBUTE);
      resolve(binding);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.code === "Escape") return finish(null);
      if (MODIFIER_KEY_CODES.has(event.code)) {
        pendingModifier = event.code;
        return;
      }
      finish({ key: event.code, modifiers: modifiersHeld(event) });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (pendingModifier && event.code === pendingModifier) finish({ key: pendingModifier, modifiers: [] });
    };
    host.setAttribute(CAPTURE_ATTRIBUTE, "");
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
  });
}

async function saveBindings(entry: KeybindingEntry, bindings: KeyBinding[], rerender: () => void): Promise<void> {
  try {
    await game.keybindings.set(entry.namespace, entry.action, bindings);
  } catch (error) {
    ui.notifications.error(error instanceof Error ? error.message : "Não foi possível salvar o atalho.");
  }
  rerender();
}

function bindingChip(entry: KeybindingEntry, binding: KeyBinding, rerender: () => void): HTMLElement {
  const remove = h("button", { type: "button", class: "icon", title: "Remover esta tecla", "aria-label": "Remover esta tecla" }, h("i", { class: "fas fa-xmark" }));
  remove.addEventListener("click", () => void saveBindings(entry, entry.bindings.filter((candidate) => candidate !== binding), rerender));
  return h("span", { class: "key-chip" }, h("kbd", {}, bindingLabel(binding)), remove);
}

function addButton(entry: KeybindingEntry, rerender: () => void): HTMLButtonElement {
  const button = h("button", { type: "button", title: "Adicionar uma tecla" }, h("i", { class: "fas fa-plus" }), " Tecla");
  button.addEventListener("click", async () => {
    button.textContent = "Pressione a tecla... (Esc cancela)";
    button.classList.add("capturing");
    const binding = await captureBinding(button);
    if (!binding) return rerender();
    if (entry.bindings.some((candidate) => bindingSignature(candidate) === bindingSignature(binding))) return rerender();
    const conflict = usedBy(binding, entry.id);
    if (conflict) ui.notifications.warn(`${bindingLabel(binding)} também é usada em "${conflict}".`);
    await saveBindings(entry, [...entry.bindings, binding], rerender);
  });
  return button;
}

function entryRow(entry: KeybindingEntry, rerender: () => void): HTMLElement {
  const reset = h("button", { type: "button", class: "icon", title: "Voltar ao padrão", "aria-label": "Voltar ao padrão" }, h("i", { class: "fas fa-rotate-left" }));
  reset.addEventListener("click", async () => {
    await game.keybindings.reset(entry.namespace, entry.action);
    rerender();
  });
  const chips = entry.bindings.length > 0 ? entry.bindings.map((binding) => bindingChip(entry, binding, rerender)) : [h("span", { class: "hint" }, "Sem tecla")];
  return h(
    "div",
    { class: "config-row" },
    h("div", { class: "config-label" }, h("strong", {}, entry.name), entry.hint ? h("p", { class: "hint" }, entry.hint) : null),
    h("div", { class: "config-control key-bindings" }, ...chips, addButton(entry, rerender), reset),
  );
}

export function buildKeybindingsTab(rerender: () => void): HTMLElement {
  const entries = listEntries();
  if (entries.length === 0) return h("p", { class: "hint" }, "Nenhum atalho registrado.");
  return h(
    "div",
    { class: "config-groups" },
    h("p", { class: "hint" }, "Clique em \"Tecla\" e aperte a combinação desejada. Para usar Ctrl, Shift ou Alt sozinhos, aperte e solte a tecla."),
    ...entries.map((entry) => entryRow(entry, rerender)),
  );
}
