import type { KeyBinding } from "@tabbletop/api";

const NAMED_KEYS: Record<string, string> = {
  Space: "Espaço",
  Enter: "Enter",
  Escape: "Esc",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  ArrowUp: "Seta para cima",
  ArrowDown: "Seta para baixo",
  ArrowLeft: "Seta para esquerda",
  ArrowRight: "Seta para direita",
  ControlLeft: "Ctrl esquerdo",
  ControlRight: "Ctrl direito",
  ShiftLeft: "Shift esquerdo",
  ShiftRight: "Shift direito",
  AltLeft: "Alt",
  AltRight: "AltGr",
  MetaLeft: "Win/Cmd",
  MetaRight: "Win/Cmd direito",
  Backquote: "'",
  Minus: "-",
  Equal: "=",
  BracketLeft: "´",
  BracketRight: "[",
  IntlRo: "/",
  Semicolon: "Ç",
  Quote: "~",
  Comma: ",",
  Period: ".",
  Slash: ";",
  Backslash: "]",
};

const MODIFIER_LABELS: Record<string, string> = { Control: "Ctrl", Shift: "Shift", Alt: "Alt" };

export const MODIFIER_KEY_CODES = new Set(["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);

export function keyCodeLabel(code: string): string {
  if (code in NAMED_KEYS) return NAMED_KEYS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

export function bindingLabel(binding: KeyBinding): string {
  const modifiers = (binding.modifiers ?? []).map((modifier) => MODIFIER_LABELS[modifier] ?? modifier);
  return [...modifiers, keyCodeLabel(binding.key)].join(" + ");
}

export function bindingSignature(binding: KeyBinding): string {
  return `${[...(binding.modifiers ?? [])].sort().join("+")}|${binding.key}`;
}

export function modifiersHeld(event: KeyboardEvent): string[] {
  const held: string[] = [];
  if (event.ctrlKey || event.metaKey) held.push("Control");
  if (event.shiftKey) held.push("Shift");
  if (event.altKey) held.push("Alt");
  return held;
}
