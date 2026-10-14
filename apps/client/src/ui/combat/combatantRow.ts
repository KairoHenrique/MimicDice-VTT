import { h } from "../../views/dom";
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

function gameMasterControls(combatant: any): HTMLElement {
  return h(
    "div",
    { class: "combatant-controls" },
    iconButton(combatant.hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye", combatant.hidden ? "Oculto dos jogadores" : "Visível para os jogadores", () => combatant.update({ hidden: !combatant.hidden }), combatant.hidden),
    iconButton("fa-solid fa-skull", combatant.defeated ? "Derrotado" : "Marcar como derrotado", () => combatant.update({ defeated: !combatant.defeated }), combatant.defeated),
    iconButton("fa-solid fa-xmark", "Tirar do combate", () => combatant.delete()),
  );
}

/** One line of the turn order: portrait, name, initiative (or a roll button for its owner) and GM toggles. */
export function buildCombatantRow(combatant: any, isCurrentTurn: boolean): HTMLElement {
  const classes = ["combatant", isCurrentTurn ? "active" : "", combatant.defeated ? "defeated" : "", combatant.hidden ? "hidden-combatant" : "", combatant.isOwner && !game.user.isGM ? "owned" : ""];
  const portrait = combatant.img ? h("img", { class: "combatant-portrait", src: combatant.img, alt: "", loading: "lazy" }) : h("span", { class: "combatant-portrait placeholder" }, h("i", { class: "fa-solid fa-user" }));
  const name = h("span", { class: "combatant-name" }, combatant.name || "Sem nome");
  const row = h(
    "li",
    { class: classes.filter(Boolean).join(" "), "data-combatant-id": combatant.id, "aria-current": isCurrentTurn ? "true" : "false", title: "Clique para ver no mapa" },
    portrait,
    name,
    game.user.isGM ? gameMasterControls(combatant) : null,
    initiativeCell(combatant),
  );
  row.addEventListener("click", () => panToCombatant(combatant));
  return row;
}
