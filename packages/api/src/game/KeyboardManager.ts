const MODIFIER_KEYS = Object.freeze({ CONTROL: "Control", SHIFT: "Shift", ALT: "Alt" });

const MODIFIER_CODES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [MODIFIER_KEYS.ALT]: ["AltLeft", "AltRight"],
  [MODIFIER_KEYS.CONTROL]: ["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "Meta", "OsLeft", "OsRight"],
  [MODIFIER_KEYS.SHIFT]: ["ShiftLeft", "ShiftRight"],
});

/** `game.keyboard`: which physical keys are currently held, cleared when the window loses focus. */
export class KeyboardManager {
  static readonly MODIFIER_KEYS = MODIFIER_KEYS;
  static readonly MODIFIER_CODES = MODIFIER_CODES;

  readonly downKeys = new Set<string>();
  #listening = false;

  activateListeners(target: Window = window): void {
    if (this.#listening) return;
    this.#listening = true;
    target.addEventListener("keydown", (event) => this.downKeys.add(event.code), { capture: true });
    target.addEventListener("keyup", (event) => this.downKeys.delete(event.code), { capture: true });
    target.addEventListener("blur", () => this.downKeys.clear());
  }

  isModifierActive(modifier: string): boolean {
    return (MODIFIER_CODES[modifier] ?? []).some((code) => this.downKeys.has(code));
  }

  isCoreActionKeyActive(_action: string): boolean {
    return false;
  }

  static emulateKeypress(): void {}
}
