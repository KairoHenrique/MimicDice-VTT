interface KeybindingAction {
  name: string;
  hint?: string;
  editable?: Array<{ key: string; modifiers?: string[] }>;
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

const MODIFIER_CHECKS: Record<string, (event: KeyboardEvent) => boolean> = {
  Shift: (event) => event.shiftKey,
  Control: (event) => event.ctrlKey || event.metaKey,
  Alt: (event) => event.altKey,
};

export class Keybindings {
  static MODIFIER_KEYS = Object.freeze({ CONTROL: "Control", SHIFT: "Shift", ALT: "Alt" });

  readonly actions = new Map<string, KeybindingAction>();
  #listening = false;

  register(namespace: string, action: string, data: KeybindingAction): void {
    this.actions.set(`${namespace}.${action}`, { ...data });
  }

  /** Current bindings per `namespace.action`, as packages read them directly. */
  get bindings(): Map<string, Array<{ key: string; modifiers?: string[] }>> {
    return new Map([...this.actions].map(([id, action]) => [id, action.editable ?? []]));
  }

  get(namespace: string, action: string): Array<{ key: string; modifiers?: string[] }> {
    return this.actions.get(`${namespace}.${action}`)?.editable ?? [];
  }

  async set(namespace: string, action: string, bindings: Array<{ key: string; modifiers?: string[] }>): Promise<void> {
    const configured = this.actions.get(`${namespace}.${action}`);
    if (configured) configured.editable = bindings;
  }

  activateListeners(target: Window = window): void {
    if (this.#listening) return;
    this.#listening = true;
    target.addEventListener("keydown", (event) => this.#dispatch(event, false));
    target.addEventListener("keyup", (event) => this.#dispatch(event, true));
  }

  #dispatch(event: KeyboardEvent, up: boolean): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || (focused as HTMLElement | null)?.isContentEditable) return;
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
