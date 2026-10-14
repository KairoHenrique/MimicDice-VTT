export const MAX_ABILITIES = 60;
export const MAX_ROLLS_PER_ABILITY = 10;
export const ABILITY_NAME_MAX = 80;
export const ABILITY_DESCRIPTION_MAX = 4000;
export const ROLL_LABEL_MAX = 60;
export const ROLL_FORMULA_MAX = 300;

export interface AbilityRoll {
  label: string;
  formula: string;
}

export interface Ability {
  name: string;
  description: string;
  rolls: AbilityRoll[];
}

export const NEW_ROLL: Readonly<AbilityRoll> = { label: "Rolagem", formula: "1d20" };

export function newAbility(): Ability {
  return { name: "Nova habilidade", description: "", rolls: [{ ...NEW_ROLL }] };
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeRoll(raw: unknown): AbilityRoll | null {
  const entry = raw as Partial<AbilityRoll> | null;
  const formula = cleanText(entry?.formula, ROLL_FORMULA_MAX).trim();
  if (!formula) return null;
  return { label: cleanText(entry?.label, ROLL_LABEL_MAX).trim() || NEW_ROLL.label, formula };
}

function normalizeAbility(raw: unknown): Ability | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<Ability>;
  const rolls = Array.isArray(entry.rolls) ? entry.rolls.slice(0, MAX_ROLLS_PER_ABILITY).map(normalizeRoll).filter((roll): roll is AbilityRoll => roll !== null) : [];
  return { name: cleanText(entry.name, ABILITY_NAME_MAX), description: cleanText(entry.description, ABILITY_DESCRIPTION_MAX), rolls };
}

/** Old sheets stored one `{label, formula}` per roll button; each becomes an ability with a single roll. */
function fromLegacyRolls(legacy: unknown): Ability[] {
  if (!Array.isArray(legacy)) return [];
  return legacy
    .map(normalizeRoll)
    .filter((roll): roll is AbilityRoll => roll !== null)
    .map((roll) => ({ name: roll.label, description: "", rolls: [{ label: "Rolar", formula: roll.formula }] }));
}

export function readAbilities(stored: unknown, legacy: unknown): Ability[] {
  const source = Array.isArray(stored) ? stored.map(normalizeAbility).filter((ability): ability is Ability => ability !== null) : fromLegacyRolls(legacy);
  return source.slice(0, MAX_ABILITIES);
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((entry, position) => (position === index ? value : entry));
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

export function moveItem<T>(list: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) return [...list];
  const moved = [...list];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

export function rollFlavor(ability: Ability, roll: AbilityRoll): string {
  return ability.name ? `${ability.name}: ${roll.label}` : roll.label;
}
