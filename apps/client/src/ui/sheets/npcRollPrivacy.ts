import { h } from "../../views/dom";
import { isPlayerCharacter, MIMICDICE_FLAG_SCOPE } from "../actors/actorRoles";

const PUBLIC_ROLLS_FLAG_KEY = "publicRolls";

function isGameMasterCharacter(actor: any): boolean {
  return Boolean(actor) && actor.documentName === "Actor" && !isPlayerCharacter(actor);
}

function rollsArePublic(actor: any): boolean {
  return actor.getFlag?.(MIMICDICE_FLAG_SCOPE, PUBLIC_ROLLS_FLAG_KEY) === true;
}

/** NPC and enemy sheets roll for the GM's eyes only, unless the GM opened that sheet's rolls to everyone. */
export function sheetRollModeFor(actor: any): string | null {
  return isGameMasterCharacter(actor) && !rollsArePublic(actor) ? "gmroll" : null;
}

/** GM-only switch in NPC and enemy sheets: who sees the rolls made from this sheet. */
export function buildRollPrivacyToggle(actor: any): HTMLElement | null {
  if (!game.user.isGM || !isGameMasterCharacter(actor)) return null;
  const isPublic = rollsArePublic(actor);
  const label = isPublic ? "Rolagens: todos veem" : "Rolagens: só o mestre";
  const button = h(
    "button",
    { type: "button", class: "md-meta-field md-roll-privacy", "aria-pressed": String(isPublic), title: isPublic ? "Clique para esconder as rolagens desta ficha dos jogadores" : "Clique para mostrar as rolagens desta ficha a todos" },
    h("i", { class: isPublic ? "fa-solid fa-eye" : "fa-solid fa-eye-slash" }),
    ` ${label}`,
  );
  button.addEventListener("click", () => void actor.setFlag(MIMICDICE_FLAG_SCOPE, PUBLIC_ROLLS_FLAG_KEY, !isPublic));
  return button;
}
