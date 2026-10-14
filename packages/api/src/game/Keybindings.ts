export interface KeyBinding {
  key: string;
  modifiers?: string[];
}

interface KeybindingAction {
  name: string;
  hint?: string;
  editable?: KeyBinding[];
  onDown?: (context: KeyboardEventContext) => unknown;
  onUp?: (context: KeyboardEventContext) => unknown;
  restricted?: boolean;
  precedence?: number;
  [extra: string]: unknown;
}

interface KeyboardEventContext {
  event: KeyboardEvent;
  key: string;
  isShift: boolean;
  isControl: boolean;
  isAlt: boolean;
  up: boolean;
  repeat: boolean;
}

export type KeybindingOverrides = Record<string, KeyBinding[]>;

const MODIFIER_CHECKS: Record<string, (event: KeyboardEvent) => boolean> = {
  Shift: (event) => event.shiftKey,
  Control: (event) => event.ctrlKey || event.metaKey,
  Alt: (event) => event.altKey,
};

const MAX_BINDINGS_PER_ACTION = 4;
const KEY_CODE_PATTERN = /^[A-Za-z0-9]{1,32}$/;

function cloneBindings(bindings: readonly KeyBinding[]): KeyBinding[] {
  return bindings.map((binding) => ({ key: binding.key, modifiers: [...(binding.modifiers ?? [])] }));
}

/** Drops anything that is not a plain key code plus known modifiers, so stored data cannot inject odd values. */
export function sanitizeBindings(value: unknown): KeyBinding[] {
  if (!Array.isArray(value)) return [];
  const bindings: KeyBinding[] = [];
  for (const entry of value.slice(0, MAX_BINDINGS_PER_ACTION)) {
    const key = (entry as { key?: unknown } | null)?.key;
    if (typeof key !== "string" || !KEY_CODE_PATTERN.test(key)) continue;
    const rawModifiers = (entry as { modifiers?: unknown }).modifiers;
    const modifiers = Array.isArray(rawModifiers) ? rawModifiers.filter((modifier): modifier is string => typeof modifier === "string" && modifier in MODIFIER_CHECKS) : [];
    bindings.push({ key, modifiers: [...new Set(modifiers)] });
  }
  return bindings;
}

function sameBindings(left: readonly KeyBinding[], right: readonly KeyBinding[]): boolean {
  const signature = (bindings: readonly KeyBinding[]) => bindings.map((binding) => `${[...(binding.modifiers ?? [])].sort().join("+")}|${binding.key}`).join(",");
  return signature(left) === signature(right);
}

export class Keybindings {
  static MODIFIER_KEYS = Object.freeze({ CONTROL: "Control", SHIFT: "Shift", ALT: "Alt" });

  readonly actions = new Map<string, KeybindingAction>();
  readonly #defaults = new Map<string, KeyBinding[]>();
  #overrides: KeybindingOverrides = {};
  #listening = false;
  /** Called with the user's customised bindings whenever they change, so the client can store them. */
  persist: ((overrides: KeybindingOverrides) => unknown) | null = null;

  register(namespace: string, action: string, data: KeybindingAction): void {
    const id = `${namespace}.${action}`;
    const defaults = cloneBindings(data.editable ?? []);
    this.#defaults.set(id, defaults);
    const override = this.#overrides[id];
    this.actions.set(id, { ...data, editable: override ? cloneBindings(override) : cloneBindings(defaults) });
  }

  /** Current bindings per `namespace.action`, as packages read them directly. */
  get bindings(): Map<string, KeyBinding[]> {
    return new Map([...this.actions].map(([id, action]) => [id, action.editable ?? []]));
  }

  get(namespace: string, action: string): KeyBinding[] {
    return this.actions.get(`${namespace}.${action}`)?.editable ?? [];
  }

  defaultsFor(id: string): KeyBinding[] {
    return cloneBindings(this.#defaults.get(id) ?? []);
  }

  async set(namespace: string, action: string, bindings: KeyBinding[]): Promise<void> {
    const id = `${namespace}.${action}`;
    const configured = this.actions.get(id);
    if (!configured) return;
    const sanitized = sanitizeBindings(bindings);
    configured.editable = sanitized;
    if (sameBindings(sanitized, this.#defaults.get(id) ?? [])) delete this.#overrides[id];
    else this.#overrides[id] = cloneBindings(sanitized);
    await this.persist?.({ ...this.#overrides });
  }

  async reset(namespace: string, action: string): Promise<void> {
    await this.set(namespace, action, this.defaultsFor(`${namespace}.${action}`));
  }

  /** Applies stored customisations, including those for actions registered later by packages. */
  loadOverrides(stored: unknown): void {
    const overrides: KeybindingOverrides = {};
    if (stored && typeof stored === "object") {
      for (const [id, bindings] of Object.entries(stored as Record<string, unknown>)) overrides[id] = sanitizeBindings(bindings);
    }
    this.#overrides = overrides;
    for (const [id, action] of this.actions) action.editable = cloneBindings(overrides[id] ?? this.#defaults.get(id) ?? []);
  }

  activateListeners(target: Window = window): void {
    if (this.#listening) return;
    this.#listening = true;
    target.addEventListener("keydown", (event) => this.#dispatch(event, false));
    target.addEventListener("keyup", (event) => this.#dispatch(event, true));
  }

  #dispatch(event: KeyboardEvent, up: boolean): void {
    const focused = document.activeElement;
    const typing = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || (focused as HTMLElement | null)?.isContentEditable;
    if (typing && !up) return;
    if (document.querySelector("[data-capturing-keybinding]")) return;
    const context: KeyboardEventContext = { event, key: event.code, isShift: event.shiftKey, isControl: event.ctrlKey || event.metaKey, isAlt: event.altKey, up, repeat: event.repeat };
    for (const action of this.actions.values()) {
      const matches = (action.editable ?? []).some(
        (binding) => binding.key === event.code && (binding.modifiers ?? []).every((modifier) => MODIFIER_CHECKS[modifier]?.(event)),
      );
      if (!matches) continue;
      const handled = up ? action.onUp?.(context) : action.onDown?.(context);
      if (handled) {
        event.preventDefault();
        return;
      }
    }
  }
}
