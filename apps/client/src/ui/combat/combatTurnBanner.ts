import { h } from "../../views/dom";
import { panToCombatant, viewedCombat } from "./combatActions";

const BANNER_ID = "combat-turn-banner";
const REFRESH_HOOKS = ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "canvasReady"];

function buildBanner(combat: any, combatant: any): HTMLElement {
  const isOwnTurn = !game.user.isGM && combatant.isOwner;
  const banner = h(
    "button",
    { type: "button", id: BANNER_ID, class: `combat-turn-banner${isOwnTurn ? " own-turn" : ""}`, title: "Ver no mapa", "aria-live": "polite" },
    h("span", { class: "combat-turn-round" }, `Turno ${combat.round}`),
    h("span", { class: "combat-turn-name" }, isOwnTurn ? `Sua vez: ${combatant.name}` : `Vez de ${combatant.name || "Sem nome"}`),
  );
  banner.addEventListener("click", () => panToCombatant(combatant));
  return banner;
}

/** Round and whose turn it is, on top of the board for everyone while a combat runs (even with the sidebar closed). */
function renderBanner(): void {
  const combat = viewedCombat();
  const combatant = combat?.started ? combat.combatant : null;
  const existing = document.getElementById(BANNER_ID);
  if (!combatant?.visible) {
    existing?.remove();
    return;
  }
  const banner = buildBanner(combat, combatant);
  if (existing) existing.replaceWith(banner);
  else document.body.append(banner);
}

export function installCombatTurnBanner(): void {
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      renderBanner();
    }, 30);
  };
  for (const hook of REFRESH_HOOKS) Hooks.on(hook, queue);
  Hooks.once("ready", queue);
}
