import { h } from "../../views/dom";
import {
  ABILITY_DESCRIPTION_MAX,
  ABILITY_NAME_MAX,
  MAX_ABILITIES,
  MAX_ROLLS_PER_ABILITY,
  NEW_ROLL,
  ROLL_FORMULA_MAX,
  ROLL_LABEL_MAX,
  moveItem,
  newAbility,
  readAbilities,
  removeAt,
  replaceAt,
  rollFlavor,
  type Ability,
  type AbilityRoll,
} from "./abilityRules";
import { rollFromSheet } from "./sheetRoll";

/** Abilities live in the world flag scope so they work with any (or no) game system. */
const FLAG_SCOPE = "world";
const ABILITIES_KEY = "abilities";
const LEGACY_ROLLS_KEY = "rollFormulas";

function loadAbilities(document: any): Ability[] {
  return readAbilities(document.getFlag?.(FLAG_SCOPE, ABILITIES_KEY), document.getFlag?.(FLAG_SCOPE, LEGACY_ROLLS_KEY));
}

function saveAbilities(document: any, abilities: Ability[]): void {
  void Promise.resolve(document.setFlag(FLAG_SCOPE, ABILITIES_KEY, abilities)).catch((error: Error) => ui.notifications.error(error.message));
}

function changeAbility(document: any, index: number, change: (ability: Ability) => Ability): void {
  const abilities = loadAbilities(document);
  const current = abilities[index];
  if (current) saveAbilities(document, replaceAt(abilities, index, change(current)));
}

function changeRoll(document: any, abilityIndex: number, rollIndex: number, change: (roll: AbilityRoll) => AbilityRoll): void {
  changeAbility(document, abilityIndex, (ability) => {
    const roll = ability.rolls[rollIndex];
    return roll ? { ...ability, rolls: replaceAt(ability.rolls, rollIndex, change(roll)) } : ability;
  });
}

/** Sheet-level change listeners would resubmit the whole form for fields that are saved here. */
function onCommit(input: HTMLInputElement | HTMLTextAreaElement, commit: (value: string) => void): void {
  input.addEventListener("change", (event) => {
    event.stopPropagation();
    commit(input.value);
  });
}

function iconButton(icon: string, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = h("button", { type: "button", class: "icon", title: label, "aria-label": label, disabled }, h("i", { class: icon }));
  button.addEventListener("click", onClick);
  return button;
}

function rollButton(document: any, ability: Ability, roll: AbilityRoll): HTMLButtonElement {
  const button = h("button", { type: "button", class: "md-ability-roll", title: `Rolar ${roll.formula}` }, h("i", { class: "fa-solid fa-dice-d20" }), ` ${roll.label}`);
  button.addEventListener("click", () => rollFromSheet(document, roll.formula, rollFlavor(ability, roll)));
  return button;
}

function fitToContent(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function descriptionEditor(document: any, index: number, ability: Ability): HTMLTextAreaElement {
  const textarea = h("textarea", { class: "md-ability-description", rows: 3, maxlength: ABILITY_DESCRIPTION_MAX, placeholder: "Descrição: o que a habilidade faz, custo, alcance...", "aria-label": `Descrição de ${ability.name || "habilidade"}` });
  textarea.value = ability.description;
  textarea.addEventListener("input", () => fitToContent(textarea));
  requestAnimationFrame(() => fitToContent(textarea));
  onCommit(textarea, (description) => changeAbility(document, index, (current) => ({ ...current, description })));
  return textarea;
}

function editableRollRow(document: any, abilityIndex: number, ability: Ability, rollIndex: number): HTMLElement {
  const roll = ability.rolls[rollIndex];
  const labelInput = h("input", { type: "text", value: roll.label, maxlength: ROLL_LABEL_MAX, placeholder: "nome (ex.: Acerto)", "aria-label": "Nome da rolagem" });
  onCommit(labelInput, (value) => changeRoll(document, abilityIndex, rollIndex, (current) => ({ ...current, label: value.trim() || NEW_ROLL.label })));
  const formulaInput = h("input", { type: "text", value: roll.formula, maxlength: ROLL_FORMULA_MAX, placeholder: "fórmula (ex.: 1d20 + @forca)", "aria-label": "Fórmula da rolagem", class: "md-ability-formula" });
  onCommit(formulaInput, (value) => {
    const formula = value.trim();
    if (!formula || !Roll.validate(formula)) {
      ui.notifications.warn("Fórmula inválida. Exemplos: 1d20 + @forca, 2d6kh, 4d6dl1.");
      formulaInput.value = roll.formula;
      return;
    }
    changeRoll(document, abilityIndex, rollIndex, (current) => ({ ...current, formula }));
  });
  const remove = iconButton("fa-solid fa-xmark", `Remover ${roll.label}`, () => changeAbility(document, abilityIndex, (current) => ({ ...current, rolls: removeAt(current.rolls, rollIndex) })));
  const roller = iconButton("fa-solid fa-dice-d20", `Rolar ${roll.label}`, () => rollFromSheet(document, roll.formula, rollFlavor(ability, roll)));
  return h("li", { class: "md-ability-roll-row" }, roller, labelInput, formulaInput, remove);
}

function editableAbilityHeader(document: any, index: number, ability: Ability, total: number): HTMLElement {
  const nameInput = h("input", { type: "text", class: "md-ability-name", value: ability.name, maxlength: ABILITY_NAME_MAX, placeholder: "Nome da habilidade", "aria-label": "Nome da habilidade" });
  onCommit(nameInput, (name) => changeAbility(document, index, (current) => ({ ...current, name: name.trim() })));
  const move = (offset: -1 | 1) => saveAbilities(document, moveItem(loadAbilities(document), index, offset));
  const remove = () => {
    if (window.confirm(`Apagar a habilidade "${ability.name || "sem nome"}"?`)) saveAbilities(document, removeAt(loadAbilities(document), index));
  };
  return h(
    "header",
    { class: "md-ability-header" },
    nameInput,
    iconButton("fa-solid fa-arrow-up", "Mover para cima", () => move(-1), index === 0),
    iconButton("fa-solid fa-arrow-down", "Mover para baixo", () => move(1), index === total - 1),
    iconButton("fa-solid fa-trash", "Apagar habilidade", remove),
  );
}

function editableAbility(document: any, index: number, ability: Ability, total: number): HTMLElement {
  const rolls = h("ol", { class: "md-ability-roll-list" }, ...ability.rolls.map((_, rollIndex) => editableRollRow(document, index, ability, rollIndex)));
  const full = ability.rolls.length >= MAX_ROLLS_PER_ABILITY;
  const addRoll = h("button", { type: "button", class: "md-ability-add-roll", disabled: full, title: full ? `Limite de ${MAX_ROLLS_PER_ABILITY} rolagens por habilidade` : undefined }, h("i", { class: "fa-solid fa-plus" }), " Rolagem");
  addRoll.addEventListener("click", () => changeAbility(document, index, (current) => ({ ...current, rolls: [...current.rolls, { ...NEW_ROLL }] })));
  return h("article", { class: "md-ability editing", "data-ability-id": String(index) }, editableAbilityHeader(document, index, ability, total), descriptionEditor(document, index, ability), rolls, addRoll);
}

function rollSummary(roll: AbilityRoll): HTMLElement {
  return h("span", { class: "md-ability-roll-info" }, h("strong", {}, roll.label), " ", h("code", {}, roll.formula));
}

/** Viewers of a shared sheet read its rolls but do not roll as that character. */
function readOnlyAbility(document: any, ability: Ability, index: number): HTMLElement {
  const canRoll = Boolean(document.canEditSheet?.());
  return h(
    "article",
    { class: "md-ability", "data-ability-id": String(index) },
    h("h3", { class: "md-ability-title" }, ability.name || "Sem nome"),
    ability.description ? h("p", { class: "md-ability-text" }, ability.description) : null,
    ability.rolls.length ? h("div", { class: "md-ability-rolls" }, ...ability.rolls.map((roll) => (canRoll ? rollButton(document, ability, roll) : rollSummary(roll)))) : null,
  );
}

function addAbilityButton(document: any, count: number): HTMLButtonElement {
  const full = count >= MAX_ABILITIES;
  const button = h("button", { type: "button", class: "md-ability-add", disabled: full, title: full ? `Limite de ${MAX_ABILITIES} habilidades por ficha` : undefined }, h("i", { class: "fa-solid fa-plus" }), " Habilidade");
  button.addEventListener("click", () => saveAbilities(document, [...loadAbilities(document), newAbility()]));
  return button;
}

/** Abilities with a description and any number of named rolls; `@campo` in a formula reads the sheet's values. */
export function buildAbilitiesSection(document: any, editable: boolean): HTMLElement {
  const abilities = loadAbilities(document);
  const cards = abilities.map((ability, index) => (editable ? editableAbility(document, index, ability, abilities.length) : readOnlyAbility(document, ability, index)));
  const empty = h("p", { class: "hint" }, editable ? "Nenhuma habilidade. Crie uma e dê a ela quantas rolagens quiser, como Acerto: 1d20 + @forca e Efeito: 2d6." : "Nenhuma habilidade.");
  const section = h("fieldset", { class: "abilities-section" }, h("legend", {}, "Habilidades"), ...(cards.length ? cards : [empty]));
  if (editable) section.append(addAbilityButton(document, abilities.length));
  return section;
}
