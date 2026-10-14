export type EditorKeyAction =
  | { type: "nudge"; dx: number; dy: number }
  | { type: "resize"; dw: number; dh: number }
  | { type: "remove" }
  | { type: "duplicate" }
  | { type: "deselect" }
  | { type: "undo" }
  | { type: "redo" };

interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Shortcut on a selected component; arrows move, Shift+arrows resize. */
export function componentKeyAction(event: KeyInput): EditorKeyAction | null {
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (command && key === "z") return event.shiftKey ? { type: "redo" } : { type: "undo" };
  if (command && key === "y") return { type: "redo" };
  if (command && key === "d") return { type: "duplicate" };
  if (event.key === "Delete" || event.key === "Backspace") return { type: "remove" };
  if (event.key === "Escape") return { type: "deselect" };
  const arrow = ARROWS[event.key];
  if (!arrow) return null;
  return event.shiftKey ? { type: "resize", dw: arrow[0], dh: arrow[1] } : { type: "nudge", dx: arrow[0], dy: arrow[1] };
}
