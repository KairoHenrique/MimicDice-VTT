import { h } from "../../views/dom";
import { rollAsSpeaker } from "../dice/rollCommands";

/** Free-form roll buttons live in the world flag scope so they work with any (or no) game system. */
const ROLL_FLAG_SCOPE = "world";
const ROLL_FLAG_KEY = "rollFormulas";
const MAX_ROLL_FORMULAS = 60;

interface RollFormula {
  label: string;
  formula: string;
}

function readFormulas(document: any): RollFormula[] {
  const stored = document.getFlag?.(ROLL_FLAG_SCOPE, ROLL_FLAG_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter((entry): entry is RollFormula => typeof entry?.label === "string" && typeof entry?.formula === "string");
}

function actorOf(document: any): any {
  return document.documentName === "Actor" ? document : (document.actor ?? null);
}

export function rollFromSheet(document: any, formula: string, label: string, extraRollData: Record<string, unknown> = {}): void {
  if (!Roll.validate(formula)) {
    ui.notifications.warn(`A fórmula "${formula}" não é uma rolagem válida.`);
    return;
  }
  void rollAsSpeaker(formula, { actor: actorOf(document), flavor: label, extraRollData }).catch((error: Error) => ui.notifications.error(error.message));
}

function formulaRow(document: any, entry: RollFormula, index: number, editable: boolean): HTMLElement {
  const rollButton = h("button", { type: "button", class: "roll-formula-button", title: `Rolar ${entry.formula}` }, h("i", { class: "fa-solid fa-dice-d20" }), ` ${entry.label}`);
  rollButton.addEventListener("click", () => rollFromSheet(document, entry.formula, entry.label));
  const row = h("li", { class: "roll-formula" }, rollButton, h("code", { class: "hint" }, entry.formula));
  if (editable) {
    const remove = h("button", { type: "button", class: "icon", title: `Remover ${entry.label}` }, h("i", { class: "fa-solid fa-xmark" }));
    remove.addEventListener("click", () => {
      const remaining = readFormulas(document).filter((_, position) => position !== index);
      void document.setFlag(ROLL_FLAG_SCOPE, ROLL_FLAG_KEY, remaining);
    });
    row.append(remove);
  }
  return row;
}

function buildAddForm(document: any): HTMLElement {
  const labelInput = h("input", { type: "text", placeholder: "nome (ex.: Ataque)", maxlength: 80, "data-ignore": "true" });
  const formulaInput = h("input", { type: "text", placeholder: "fórmula (ex.: 1d20 + @forca)", maxlength: 300, "data-ignore": "true" });
  const addButton = h("button", { type: "button" }, h("i", { class: "fa-solid fa-plus" }), " Rolagem");
  addButton.addEventListener("click", () => {
    const label = labelInput.value.trim();
    const formula = formulaInput.value.trim();
    if (!label || !formula) {
      ui.notifications.warn("Preencha o nome e a fórmula.");
      return;
    }
    if (!Roll.validate(formula)) {
      ui.notifications.warn("Fórmula inválida. Exemplos: 1d20 + @forca, 2d6kh, 4d6dl1.");
      return;
    }
    const formulas = readFormulas(document);
    if (formulas.length >= MAX_ROLL_FORMULAS) {
      ui.notifications.warn(`Limite de ${MAX_ROLL_FORMULAS} rolagens por ficha.`);
      return;
    }
    void document.setFlag(ROLL_FLAG_SCOPE, ROLL_FLAG_KEY, [...formulas, { label, formula }]);
  });
  return h("div", { class: "form-group custom-field" }, labelInput, formulaInput, addButton);
}

/** Named roll buttons (Multiverse style): `@campo` in a formula reads the sheet's attributes. */
export function buildRollFormulasSection(document: any, editable: boolean): HTMLElement {
  const formulas = readFormulas(document);
  const list = h("ol", { class: "roll-formulas" }, ...formulas.map((entry, index) => formulaRow(document, entry, index, editable)));
  if (formulas.length === 0) list.append(h("li", { class: "hint" }, "Nenhuma rolagem. Crie uma, como \"Ataque: 1d20 + @forca\"."));
  const section = h("fieldset", { class: "rolls-section" }, h("legend", {}, "Rolagens"), list);
  if (editable) section.append(buildAddForm(document));
  return section;
}
