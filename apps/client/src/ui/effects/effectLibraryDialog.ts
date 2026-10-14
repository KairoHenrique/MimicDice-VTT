import { DialogV2 } from "@tabbletop/api";
import { dealsTurnDamage, EFFECT_ICON_CHOICES, type EffectDefinition, effectDefinitionSchema, formatDamage, MAX_DAMAGE_DICE_LENGTH, MAX_EFFECT_DEFINITIONS, MAX_VISION_LIMIT, parseDamageInput } from "@tabbletop/protocol";
import { statusResources } from "../../game/tableRules";
import { h } from "../../views/dom";
import { EFFECT_LIBRARY_CHANGED_HOOK, effectDefinitions, newEffectId, saveEffectDefinitions } from "./effectStore";
import { effectIcon, effectLabel } from "./effectVisuals";

const DEFAULT_DRAFT: Omit<EffectDefinition, "id"> = { name: "", description: "", icon: "fa-solid fa-wand-magic-sparkles", color: "#8e44ad", damagePerTurn: 0, damageDice: "", damageResourceId: null, actsLast: false, visionLimit: null };

/** Text box for damage: a whole number or dice such as 1d6+2 (negative heals). */
export function damageInput(name: string, value: string, label: string): HTMLInputElement {
  return h("input", { type: "text", name, value, maxlength: MAX_DAMAGE_DICE_LENGTH, placeholder: "0, 3 ou 1d6+2", "aria-label": label, autocomplete: "off", spellcheck: "false" });
}

/** One line describing what the effect does in combat. */
export function describeMechanics(effect: Pick<EffectDefinition, "damagePerTurn" | "damageDice" | "damageResourceId" | "actsLast" | "visionLimit">): string {
  const parts: string[] = [];
  if (dealsTurnDamage(effect)) {
    const label = statusResources().find((resource) => resource.id === effect.damageResourceId)?.label ?? effect.damageResourceId;
    const amount = formatDamage(effect);
    const heals = !effect.damageDice && effect.damagePerTurn < 0;
    parts.push(heals ? `recupera ${-effect.damagePerTurn} de ${label} por turno` : `perde ${amount} de ${label} por turno`);
  }
  if (effect.actsLast) parts.push("age por último");
  if (effect.visionLimit !== null) parts.push(effect.visionLimit === 0 ? "não enxerga" : `enxerga até ${effect.visionLimit.toLocaleString()} m`);
  return parts.length > 0 ? parts.join(", ") : "Só aparece como lembrete";
}

function numberInput(name: string, value: number, min: number, max: number, step = 1): HTMLInputElement {
  return h("input", { type: "number", name, value: String(value), min, max, step, inputmode: "decimal" });
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h("div", { class: "form-group md-effect-field" }, h("label", {}, label, control), hint ? h("p", { class: "hint" }, hint) : null);
}

interface EditorControls {
  name: HTMLInputElement;
  description: HTMLInputElement;
  icon: HTMLInputElement;
  color: HTMLInputElement;
  damage: HTMLInputElement;
  resource: HTMLSelectElement;
  actsLast: HTMLInputElement;
  limitsVision: HTMLInputElement;
  vision: HTMLInputElement;
}

function iconPicker(icon: HTMLInputElement): HTMLElement {
  const choices = EFFECT_ICON_CHOICES.map((choice) => {
    const button = h("button", { type: "button", class: "icon md-effect-icon-choice", title: choice.replace("fa-solid fa-", ""), "aria-label": `Ícone ${choice.replace("fa-solid fa-", "")}`, "aria-pressed": String(icon.value === choice) }, effectIcon({ icon: choice }));
    button.addEventListener("click", () => {
      icon.value = choice;
      icon.dispatchEvent(new Event("input"));
    });
    return button;
  });
  icon.addEventListener("input", () => {
    for (const [index, button] of choices.entries()) button.setAttribute("aria-pressed", String(icon.value.trim() === EFFECT_ICON_CHOICES[index]));
  });
  return h("div", { class: "md-effect-icon-grid", role: "group", "aria-label": "Ícones" }, ...choices);
}

function editorControls(draft: Omit<EffectDefinition, "id">): EditorControls {
  const resource = h("select", { name: "resource", "aria-label": "Recurso que sofre o dano" }, ...statusResources().map((entry) => h("option", { value: entry.id, selected: entry.id === (draft.damageResourceId ?? "vida") }, entry.label)));
  return {
    name: h("input", { type: "text", name: "name", value: draft.name, maxlength: 40, required: true, placeholder: "Envenenado" }),
    description: h("input", { type: "text", name: "description", value: draft.description, maxlength: 200, placeholder: "O que o efeito faz, para lembrar na mesa" }),
    icon: h("input", { type: "text", name: "icon", value: draft.icon, maxlength: 60, "aria-label": "Ícone ou emoji" }),
    color: h("input", { type: "color", name: "color", value: draft.color }),
    damage: damageInput("damage", formatDamage(draft), "Dano por turno"),
    resource,
    actsLast: h("input", { type: "checkbox", name: "actsLast", checked: draft.actsLast }),
    limitsVision: h("input", { type: "checkbox", name: "limitsVision", checked: draft.visionLimit !== null }),
    vision: numberInput("vision", draft.visionLimit ?? 1.5, 0, MAX_VISION_LIMIT, 0.5),
  };
}

function editorContent(controls: EditorControls): HTMLElement {
  const syncVision = () => {
    controls.vision.disabled = !controls.limitsVision.checked;
  };
  controls.limitsVision.addEventListener("change", syncVision);
  syncVision();
  return h(
    "div",
    { class: "md-effect-editor" },
    field("Nome", controls.name),
    field("Descrição", controls.description),
    h("div", { class: "form-group md-effect-field" }, h("label", {}, "Ícone (escolha um ou digite um emoji)", controls.icon), iconPicker(controls.icon)),
    field("Cor", controls.color),
    h("fieldset", { class: "md-effect-mechanics" }, h("legend", {}, "No combate"), field("Dano no começo de cada turno do personagem", h("span", { class: "md-effect-inline" }, controls.damage, controls.resource), "Número ou dados, como 2 ou 1d6+2 (rola a cada turno). Vazio ou 0 = sem dano. Número negativo cura."), h("label", { class: "md-check-row" }, controls.actsLast, h("span", {}, "Sempre age por último")), h("label", { class: "md-check-row" }, controls.limitsVision, h("span", {}, "Limita a visão a"), controls.vision, h("span", {}, "metros (0 = cego)"))),
  );
}

/** Invalid damage text is kept as typed so the schema rejects it and the form reopens with it. */
function readDraft(controls: EditorControls): Omit<EffectDefinition, "id"> {
  const damage = parseDamageInput(controls.damage.value) ?? { damagePerTurn: 0, damageDice: controls.damage.value };
  return {
    name: controls.name.value.trim(),
    description: controls.description.value.trim(),
    icon: controls.icon.value.trim(),
    color: controls.color.value,
    ...damage,
    damageResourceId: damage.damagePerTurn !== 0 || damage.damageDice !== "" ? controls.resource.value : null,
    actsLast: controls.actsLast.checked,
    visionLimit: controls.limitsVision.checked ? Math.max(0, Number(controls.vision.value) || 0) : null,
  };
}

/** Create or edit one effect; invalid input reopens the form with what was typed. */
export async function editEffectDialog(existing: EffectDefinition | null): Promise<EffectDefinition | null> {
  let draft: Omit<EffectDefinition, "id"> = existing ?? DEFAULT_DRAFT;
  for (;;) {
    const controls = editorControls(draft);
    const typed = await DialogV2.prompt({ window: { title: existing ? `Editar ${existing.name}` : "Novo efeito" }, position: { width: 480 } as any, content: editorContent(controls), ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => readDraft(controls) } });
    if (!typed || typeof typed !== "object") return null;
    draft = typed as Omit<EffectDefinition, "id">;
    const parsed = effectDefinitionSchema.safeParse({ ...draft, id: existing?.id ?? newEffectId() });
    if (parsed.success) return parsed.data;
    ui.notifications.warn("Confira o nome (obrigatório), o ícone (um da lista ou um emoji) e o dano (número ou dados, como 1d6+2).");
  }
}

async function saveEdited(edited: EffectDefinition): Promise<void> {
  const definitions = effectDefinitions();
  const index = definitions.findIndex((definition) => definition.id === edited.id);
  if (index >= 0) definitions[index] = edited;
  else if (definitions.length >= MAX_EFFECT_DEFINITIONS) return void ui.notifications.warn(`No máximo ${MAX_EFFECT_DEFINITIONS} efeitos.`);
  else definitions.push(edited);
  await saveEffectDefinitions(definitions);
}

export async function createEffect(): Promise<EffectDefinition | null> {
  const created = await editEffectDialog(null);
  if (created) await saveEdited(created);
  return created;
}

async function deleteEffect(definition: EffectDefinition): Promise<void> {
  const confirmed = await DialogV2.confirm({ window: { title: "Apagar efeito" }, content: h("p", {}, `Apagar "${definition.name}" da lista? Quem já está com ele continua até acabar.`), yes: { label: "Apagar" }, no: { label: "Cancelar" } });
  if (confirmed === true) await saveEffectDefinitions(effectDefinitions().filter((entry) => entry.id !== definition.id));
}

function libraryRow(definition: EffectDefinition): HTMLElement {
  const edit = h("button", { type: "button", class: "icon", title: `Editar ${definition.name}`, "aria-label": `Editar ${definition.name}` }, h("i", { class: "fa-solid fa-pen", "aria-hidden": "true" }));
  edit.addEventListener("click", async () => {
    const edited = await editEffectDialog(definition);
    if (edited) await saveEdited(edited);
  });
  const remove = h("button", { type: "button", class: "icon", title: `Apagar ${definition.name}`, "aria-label": `Apagar ${definition.name}` }, h("i", { class: "fa-solid fa-trash", "aria-hidden": "true" }));
  remove.addEventListener("click", () => void deleteEffect(definition));
  return h("li", { class: "md-effect-row" }, h("div", { class: "md-effect-row-text" }, effectLabel(definition), h("span", { class: "hint" }, describeMechanics(definition))), h("div", { class: "md-effect-row-actions" }, edit, remove));
}

/** GM: every effect of the world, with create, edit and delete. */
export async function openEffectLibrary(): Promise<void> {
  const list = h("ul", { class: "md-effect-list", "aria-label": "Efeitos" });
  const renderList = () => {
    const definitions = effectDefinitions();
    list.replaceChildren(...(definitions.length > 0 ? definitions.map(libraryRow) : [h("li", { class: "hint" }, "Nenhum efeito ainda.")]));
  };
  renderList();
  const hookId = Hooks.on(EFFECT_LIBRARY_CHANGED_HOOK, renderList);
  const add = h("button", { type: "button" }, h("i", { class: "fa-solid fa-plus", "aria-hidden": "true" }), " Novo efeito");
  add.addEventListener("click", () => void createEffect());
  const content = h("div", { class: "md-effect-library" }, h("p", { class: "hint" }, "Crie efeitos com ícone, cor e o que mudam no combate. Aplique pelo clique direito no token ou pelo painel de status."), add, list);
  try {
    await DialogV2.prompt({ window: { title: "Efeitos" }, position: { width: 520 } as any, content, ok: { label: "Fechar", icon: "fa-solid fa-check" } });
  } finally {
    Hooks.off(EFFECT_LIBRARY_CHANGED_HOOK, hookId);
  }
}
