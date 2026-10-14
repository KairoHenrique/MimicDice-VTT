import type { ClientSettings } from "@tabbletop/api";
import {
  ACTOR_EFFECTS_FLAG,
  actorEffectsSchema,
  type AppliedEffect,
  clampTurns,
  EFFECT_DEFINITIONS_SETTING_KEY,
  type EffectDefinition,
  effectDefinitionsSchema,
  MAX_EFFECT_TURNS,
  parseActorEffects,
  parseEffectDefinitions,
  STARTER_EFFECT_DEFINITIONS,
  withAppliedEffect,
} from "@tabbletop/protocol";
import { MIMICDICE_FLAG_SCOPE } from "../actors/actorRoles";

const [EFFECTS_NAMESPACE, EFFECTS_KEY] = EFFECT_DEFINITIONS_SETTING_KEY.split(".") as [string, string];
const EFFECTS_FLAG_PATH = `flags.${MIMICDICE_FLAG_SCOPE}.${ACTOR_EFFECTS_FLAG}`;

/** Fired when the GM changes the effect library. */
export const EFFECT_LIBRARY_CHANGED_HOOK = "effectLibraryChanged";

export function registerEffectSettings(settings: ClientSettings): void {
  settings.register(EFFECTS_NAMESPACE, EFFECTS_KEY, {
    name: "Efeitos criados pelo mestre",
    scope: "world",
    config: false,
    type: Object,
    default: STARTER_EFFECT_DEFINITIONS.map((definition) => ({ ...definition })),
    onChange: () => Hooks.callAll(EFFECT_LIBRARY_CHANGED_HOOK),
  });
}

export function effectDefinitions(): EffectDefinition[] {
  return parseEffectDefinitions(game.settings.get(EFFECTS_NAMESPACE, EFFECTS_KEY));
}

export function saveEffectDefinitions(definitions: readonly EffectDefinition[]): Promise<unknown> {
  return game.settings.set(EFFECTS_NAMESPACE, EFFECTS_KEY, effectDefinitionsSchema.parse(definitions));
}

const parsedEffects = new WeakMap<object, AppliedEffect[]>();
const NO_EFFECTS: AppliedEffect[] = [];

/** Read on every token refresh and vision pass, so each stored list is validated once. */
export function actorEffects(actor: any): AppliedEffect[] {
  const raw = actor?.getFlag?.(MIMICDICE_FLAG_SCOPE, ACTOR_EFFECTS_FLAG);
  if (!Array.isArray(raw) || raw.length === 0) return NO_EFFECTS;
  const cached = parsedEffects.get(raw);
  if (cached) return cached;
  const parsed = parseActorEffects(raw);
  parsedEffects.set(raw, parsed);
  return parsed;
}

export function saveActorEffects(actor: any, effects: readonly AppliedEffect[]): Promise<unknown> {
  return actor.update({ [EFFECTS_FLAG_PATH]: actorEffectsSchema.parse(effects) });
}

export function newEffectId(): string {
  return crypto.getRandomValues(new Uint32Array(2)).reduce((text, part) => text + part.toString(36), "").slice(0, 16);
}

export interface RolledTurns {
  turns: number;
  /** "1d4+1 = 3" when dice were rolled, for the chat or a notification. */
  note: string | null;
}

/** Fixed turns pass through; a dice duration is rolled once (a roll that fails counts as 1 turn). */
export async function rollTurns(duration: number | string): Promise<RolledTurns> {
  if (typeof duration === "number") return { turns: clampTurns(duration), note: null };
  try {
    const roll = await new Roll(duration).evaluate();
    const turns = clampTurns(Number(roll.total));
    return { turns, note: `${duration} = ${turns}` };
  } catch {
    return { turns: 1, note: null };
  }
}

export interface EffectApplication {
  turns: number;
  /** Replaces the definition's damage per turn for this application only. */
  damage?: Pick<EffectDefinition, "damagePerTurn" | "damageDice">;
}

export function appliedFrom(definition: EffectDefinition, { turns, damage }: EffectApplication): AppliedEffect {
  const turnsLeft = Math.min(Math.max(Math.round(turns), 1), MAX_EFFECT_TURNS);
  return { ...definition, id: newEffectId(), definitionId: definition.id, turnsLeft, ...(damage ?? {}) };
}

export async function applyEffectToActors(actors: readonly any[], definition: EffectDefinition, application: EffectApplication): Promise<number> {
  const results = await Promise.allSettled(actors.map((actor) => saveActorEffects(actor, withAppliedEffect(actorEffects(actor), appliedFrom(definition, application)))));
  return results.filter((result) => result.status === "fulfilled").length;
}

export function removeActorEffect(actor: any, effectId: string): Promise<unknown> {
  return saveActorEffects(
    actor,
    actorEffects(actor).filter((effect) => effect.id !== effectId),
  );
}
