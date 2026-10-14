import { DialogV2, type MenuEntry } from "@tabbletop/api";
import { type EffectDefinition, formatDamage, parseDamageInput, parseTurnsInput, searchEffectDefinitions } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { createEffect, damageInput, describeMechanics } from "./effectLibraryDialog";
import { actorEffects, applyEffectToActors, effectDefinitions, removeActorEffect, rollTurns } from "./effectStore";
import { effectLabel, effectTitle } from "./effectVisuals";

const DEFAULT_TURNS = 3;

interface ApplyChoice {
  definition: EffectDefinition;
  turns: number | string;
  damage: Pick<EffectDefinition, "damagePerTurn" | "damageDice">;
}

function currentEffectsSection(actor: any): HTMLElement | null {
  const effects = actorEffects(actor);
  if (effects.length === 0) return null;
  const items = effects.map((effect) => {
    const remove = h("button", { type: "button", class: "icon", title: `Tirar ${effect.name}`, "aria-label": `Tirar ${effect.name}` }, h("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }));
    const item = h("li", { class: "md-effect-row", title: effectTitle(effect) }, h("div", { class: "md-effect-row-text" }, effectLabel(effect), h("span", { class: "hint" }, `${effect.turnsLeft} turno(s) restante(s)`)), remove);
    remove.addEventListener("click", async () => {
      await removeActorEffect(actor, effect.id);
      item.remove();
    });
    return item;
  });
  return h("section", { class: "md-effect-current" }, h("h3", {}, `Efeitos em ${actor.name}`), h("ul", { class: "md-effect-list" }, ...items));
}

function optionRow(definition: EffectDefinition, radio: HTMLInputElement): HTMLElement {
  return h("label", { class: "md-effect-option" }, radio, h("span", { class: "md-effect-row-text" }, effectLabel(definition), h("span", { class: "hint" }, definition.description || describeMechanics(definition))));
}

/** Filtering keeps a visible effect selected, so "Aplicar" never applies something the GM can no longer see. */
function wireSearch(search: HTMLInputElement, definitions: EffectDefinition[], rows: HTMLElement[], radios: HTMLInputElement[], empty: HTMLElement): void {
  search.addEventListener("input", () => {
    const visible = new Set(searchEffectDefinitions(definitions, search.value).map((definition) => definition.id));
    rows.forEach((row, index) => (row.hidden = !visible.has(definitions[index]!.id)));
    empty.hidden = visible.size > 0;
    const checkedIndex = radios.findIndex((radio) => radio.checked);
    if (checkedIndex >= 0 && !rows[checkedIndex]!.hidden) return;
    const firstVisible = rows.findIndex((row) => !row.hidden);
    for (const radio of radios) radio.checked = false;
    if (firstVisible >= 0) radios[firstVisible]!.checked = true;
    radios[firstVisible]?.dispatchEvent(new Event("change"));
  });
}

function targetsText(actors: readonly any[]): string {
  return actors.length === 1 ? actors[0].name : `${actors.length} personagens`;
}

/** The right-clicked token plus, when it is part of the selection, every other selected token. */
function menuTargets(token: any): any[] {
  const selected: any[] = token.controlled ? (canvas?.tokens?.controlled ?? []) : [token];
  const actors = selected.map((entry) => entry.actor).filter(Boolean);
  return [...new Map(actors.map((actor) => [actor.id, actor])).values()];
}

export function registerEffectMenu(): void {
  Hooks.on("getTokenMenuEntries", (token: any, entries: MenuEntry[]) => {
    if (!game.user.isGM || !token.actor) return;
    entries.push({ label: "Aplicar ou tirar efeito", icon: "fa-solid fa-wand-magic-sparkles", onSelect: () => applyEffectDialog(menuTargets(token)) });
  });
}

/** GM: search the effect library, pick one, set how many turns it lasts (and its damage), and apply it. */
export async function applyEffectDialog(actors: readonly any[]): Promise<void> {
  if (!game.user.isGM || actors.length === 0) return;
  const definitions = effectDefinitions();
  if (definitions.length === 0) {
    ui.notifications.info("Crie o primeiro efeito.");
    if (!(await createEffect())) return;
    return applyEffectDialog(actors);
  }
  const radios = definitions.map((definition, index) => h("input", { type: "radio", name: "effect", value: definition.id, checked: index === 0 }));
  const rows = definitions.map((definition, index) => optionRow(definition, radios[index]!));
  const search = h("input", { type: "search", placeholder: "Buscar efeito", "aria-label": "Buscar efeito", autocomplete: "off" });
  const empty = h("p", { class: "hint", hidden: true }, "Nenhum efeito com esse nome.");
  wireSearch(search, definitions, rows, radios, empty);
  const turns = h("input", { type: "text", maxLength: 40, value: String(DEFAULT_TURNS), placeholder: "3 ou 1d4", class: "md-effect-turns", "aria-label": "Duração em turnos (número ou dados, como 1d4)" });
  const damage = damageInput("damage", formatDamage(definitions[0]!), "Dano por turno");
  const damageField = h("label", { class: "md-effect-inline" }, "Dano por turno", damage);
  const selected = () => definitions.find((definition) => definition.id === radios.find((radio) => radio.checked)?.value) ?? null;
  const syncDamage = () => {
    const definition = selected();
    damageField.hidden = !definition?.damageResourceId;
    if (definition) damage.value = formatDamage(definition);
  };
  for (const radio of radios) radio.addEventListener("change", syncDamage);
  syncDamage();
  const content = h(
    "div",
    { class: "md-effect-apply" },
    actors.length === 1 ? currentEffectsSection(actors[0]) : null,
    search,
    h("div", { class: "md-effect-options", role: "radiogroup", "aria-label": "Efeitos" }, ...rows, empty),
    h("div", { class: "md-effect-inline" }, h("label", { class: "md-effect-inline" }, "Dura", turns, "turno(s)"), damageField),
  );
  const choice = (await DialogV2.prompt({
    window: { title: `Aplicar efeito em ${targetsText(actors)}` },
    position: { width: 480 } as any,
    content,
    ok: {
      label: "Aplicar",
      icon: "fa-solid fa-wand-magic-sparkles",
      callback: (): ApplyChoice | null => {
        const definition = selected();
        if (!definition) return null;
        const parsedDamage = parseDamageInput(damage.value);
        if (!parsedDamage) {
          ui.notifications.warn("Dano inválido: use um número ou dados, como 2 ou 1d6+2.");
          return null;
        }
        const duration = parseTurnsInput(turns.value);
        if (duration === null) {
          ui.notifications.warn("Duração inválida: use um número ou dados, como 3 ou 1d4.");
          return null;
        }
        return { definition, turns: duration, damage: parsedDamage };
      },
    },
  })) as ApplyChoice | null;
  if (!choice) return;
  const rolled = await rollTurns(choice.turns);
  const applied = await applyEffectToActors(actors, choice.definition, { turns: rolled.turns, damage: choice.damage });
  const duration = rolled.note ? ` por ${rolled.turns} turno(s) (${rolled.note})` : "";
  if (applied < actors.length) ui.notifications.warn(`O efeito não pôde ser aplicado em ${actors.length - applied} personagem(ns).`);
  else ui.notifications.info(`${choice.definition.name} aplicado em ${targetsText(actors)}${duration}.`);
}
