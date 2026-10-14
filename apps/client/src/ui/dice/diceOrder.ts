export const DICE_ORDERS = { highest: "Dados: maior → menor", rolled: "Dados: ordem da rolagem" } as const;

export type DiceOrder = keyof typeof DICE_ORDERS;

const STORAGE_KEY = "mimicdice.chatDiceOrder";

function isDiceOrder(value: unknown): value is DiceOrder {
  return value === "highest" || value === "rolled";
}

export function readDiceOrder(): DiceOrder {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isDiceOrder(stored) ? stored : "highest";
  } catch {
    return "highest";
  }
}

export function saveDiceOrder(order: DiceOrder): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, order);
  } catch {
    /* Private browsing may refuse storage; the choice then lasts until reload. */
  }
}

function numberAttribute(element: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(element.dataset[name] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function compareDice(order: DiceOrder): (left: HTMLElement, right: HTMLElement) => number {
  const byIndex = (left: HTMLElement, right: HTMLElement) => numberAttribute(left, "index", 0) - numberAttribute(right, "index", 0);
  if (order === "rolled") return byIndex;
  return (left, right) => numberAttribute(right, "value", -Infinity) - numberAttribute(left, "value", -Infinity) || byIndex(left, right);
}

/** Reorders the dice shown inside roll cards without touching the stored message. */
export function orderDice(root: ParentNode, order: DiceOrder): void {
  const compare = compareDice(order);
  for (const list of Array.from(root.querySelectorAll<HTMLElement>(".dice-rolls"))) {
    const dice = Array.from(list.children) as HTMLElement[];
    if (dice.length < 2) continue;
    list.append(...dice.sort(compare));
  }
}
