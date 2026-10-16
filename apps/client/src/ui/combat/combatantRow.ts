import { h } from "../../views/dom";
import { applyActorPortraitFocus } from "../actors/appearances";
import { actorEffects } from "../effects/effectStore";
import { effectChipRow } from "../effects/effectVisuals";
import { panToCombatant } from "./combatActions";

function iconButton(icon: string, label: string, onClick: () => unknown, pressed?: boolean): HTMLButtonElement {
  const button = h("button", { type: "button", class: "icon combatant-control", title: label, "aria-label": label }, h("i", { class: icon, "aria-hidden": "true" }));
  if (pressed !== undefined) button.setAttribute("aria-pressed", String(pressed));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void onClick();
  });
  return button;
}

const INITIATIVE_LIMIT = 999;

function hasInitiative(combatant: any): boolean {
  return combatant.initiative !== null && combatant.initiative !== undefined;
}

/** The GM types each initiative; empty clears it. Players only read the number. */
function initiativeCell(combatant: any): HTMLElement {
  if (!game.user.isGM) {
    return hasInitiative(combatant) ? h("span", { class: "combatant-initiative", title: "Iniciativa" }, String(combatant.initiative)) : h("span", { class: "combatant-initiative pending", title: "O mestre ainda não definiu" }, "–");
  }
  const input = h("input", {
    type: "number",
    class: "combatant-initiative-input",
    value: hasInitiative(combatant) ? String(combatant.initiative) : "",
    min: -INITIATIVE_LIMIT,
    max: INITIATIVE_LIMIT,
    step: "any",
    inputmode: "numeric",
    placeholder: "–",
    title: `Iniciativa de ${combatant.name}`,
    "aria-label": `Iniciativa de ${combatant.name}`,
  });
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  input.addEventListener("change", () => {
    if (combatant.parent?.hasManualOrder) ui.notifications.info("A ordem está manual: use \"Ordenar pela iniciativa\" para reordenar pelos números.");
    const raw = input.value.trim();
    const parsed = raw === "" ? null : Number(raw);
    if (parsed !== null && (!Number.isFinite(parsed) || Math.abs(parsed) > INITIATIVE_LIMIT)) {
      ui.notifications.warn(`Use um número entre -${INITIATIVE_LIMIT} e ${INITIATIVE_LIMIT}.`);
      input.value = hasInitiative(combatant) ? String(combatant.initiative) : "";
      return;
    }
    void combatant.update({ initiative: parsed });
  });
  return input;
}

/** Drag the grip to reorder; with the keyboard, the arrow keys move the combatant up or down one place. */
function orderHandle(combatant: any): HTMLButtonElement {
  const label = `Mudar a posição de ${combatant.name || "combatente"} (arraste ou use as setas)`;
  const handle = h("button", { type: "button", class: "icon combatant-handle", title: label, "aria-label": label }, h("i", { class: "fa-solid fa-grip-vertical", "aria-hidden": "true" }));
  handle.addEventListener("click", (event) => event.stopPropagation());
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    const combat = combatant.parent;
    const index = combat.turns.indexOf(combatant);
    void combat.moveCombatant(combatant.id, index + (event.key === "ArrowUp" ? -1 : 1));
  });
  return handle;
}

function gameMasterControls(combatant: any): HTMLElement {
  const combat = combatant.parent;
  return h(
    "div",
    { class: "combatant-controls" },
    iconButton("fa-solid fa-angles-down", "Mandar para o fim da ordem (ex.: ficou tonto). Se for a vez dele, passa para o próximo.", () => combat.delayToEnd(combatant.id)),
    iconButton(combatant.hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye", combatant.hidden ? "Oculto dos jogadores" : "Visível para os jogadores", () => combatant.update({ hidden: !combatant.hidden }), combatant.hidden),
    iconButton("fa-solid fa-skull", combatant.defeated ? "Derrotado" : "Marcar como derrotado", () => combatant.update({ defeated: !combatant.defeated }), combatant.defeated),
    iconButton("fa-solid fa-xmark", "Tirar do combate", () => combatant.delete()),
  );
}

/** One line of the turn order: portrait, name, initiative (or a roll button for its owner) and GM toggles. */
export function buildCombatantRow(combatant: any, isCurrentTurn: boolean): HTMLElement {
  const classes = ["combatant", isCurrentTurn ? "active" : "", combatant.defeated ? "defeated" : "", combatant.hidden ? "hidden-combatant" : "", combatant.isOwner && !game.user.isGM ? "owned" : ""];
  const portrait = combatant.img
    ? applyActorPortraitFocus(h("img", { class: "combatant-portrait", src: combatant.img, alt: "", loading: "lazy" }) as HTMLImageElement, combatant.actor)
    : h("span", { class: "combatant-portrait placeholder" }, h("i", { class: "fa-solid fa-user" }));
  const name = h("span", { class: "combatant-name" }, combatant.name || "Sem nome");
  const row = h(
    "li",
    { class: classes.filter(Boolean).join(" "), "data-combatant-id": combatant.id, "aria-current": isCurrentTurn ? "true" : "false", title: "Clique para ver no mapa" },
    game.user.isGM ? orderHandle(combatant) : null,
    portrait,
    h("span", { class: "combatant-name-block" }, name, effectChipRow(actorEffects(combatant.actor), "combatant-effects")),
    game.user.isGM ? gameMasterControls(combatant) : null,
    initiativeCell(combatant),
  );
  row.addEventListener("click", () => panToCombatant(combatant));
  return row;
}
