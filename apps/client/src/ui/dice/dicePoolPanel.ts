import { h } from "../../views/dom";
import { MAX_POOLED_DICE, type DicePool } from "./DicePool";

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export interface DicePoolPanel {
  element: HTMLElement;
  refresh(): void;
}

/** Die buttons queue dice (left click adds, right click removes) with a count badge; nothing rolls until sent. */
export function buildDicePoolPanel(pool: DicePool, rollButton: HTMLButtonElement): DicePoolPanel {
  const badges = new Map<number, HTMLElement>();
  const summary = h("span", { class: "dice-pool-summary" });
  const clearButton = h("button", { type: "button", class: "dice-pool-clear", title: "Limpar dados selecionados" }, h("i", { class: "fa-solid fa-xmark" }), " Limpar");
  const quickDice = h("div", { class: "quick-dice", role: "group", "aria-label": "Escolher dados" });
  let limitWarningShown = false;
  const refresh = () => {
    if (!pool.isFull) limitWarningShown = false;
    for (const [faces, badge] of badges) {
      const count = pool.countOf(faces);
      badge.textContent = count > 0 ? String(count) : "";
      badge.parentElement?.classList.toggle("selected", count > 0);
    }
    const total = pool.total;
    summary.textContent = total > 0 ? `${pool.toFormula()}  (${total}/${MAX_POOLED_DICE})` : `Clique nos dados para escolher (máx. ${MAX_POOLED_DICE})`;
    clearButton.hidden = total === 0;
    rollButton.classList.toggle("has-pool", total > 0);
  };
  for (const faces of QUICK_DICE) {
    const badge = h("span", { class: "die-count", "aria-hidden": "true" });
    const button = h("button", { type: "button", class: "quick-die", title: `Adicionar 1d${faces} (botão direito remove)` }, `d${faces}`, badge);
    button.addEventListener("click", () => {
      if (!pool.add(faces) && !limitWarningShown) {
        limitWarningShown = true;
        ui.notifications.warn(`Limite de ${MAX_POOLED_DICE} dados por rolagem.`);
      }
      refresh();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      pool.remove(faces);
      refresh();
    });
    badges.set(faces, badge);
    quickDice.append(button);
  }
  clearButton.addEventListener("click", () => {
    pool.clear();
    refresh();
  });
  refresh();
  return { element: h("div", { class: "dice-pool" }, quickDice, h("div", { class: "dice-pool-row" }, summary, clearButton)), refresh };
}
