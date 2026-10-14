import { z } from "zod";

/** World setting (JSON array): the effects the GM created for this world. */
export const EFFECT_DEFINITIONS_SETTING_KEY = "core.effectDefinitions";
/** Actor flag (scope `world`): effects currently on the character; only the GM writes it. */
export const ACTOR_EFFECTS_FLAG = "effects";

export const MAX_EFFECT_DEFINITIONS = 80;
export const MAX_ACTOR_EFFECTS = 12;
export const MAX_EFFECT_TURNS = 99;
export const MAX_EFFECT_DAMAGE = 999;
export const MAX_VISION_LIMIT = 1000;

const FONT_AWESOME_ICON = /^fa-(solid|regular) fa-[a-z0-9-]{1,40}$/;
const EMOJI_ICON = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f]{1,8}$/u;

/** A Font Awesome class pair or a short emoji; icons are never inserted as HTML. */
export const effectIconSchema = z
  .string()
  .trim()
  .refine((icon) => FONT_AWESOME_ICON.test(icon) || EMOJI_ICON.test(icon), "Ícone inválido");

export function isFontAwesomeIcon(icon: string): boolean {
  return FONT_AWESOME_ICON.test(icon);
}

const localIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const resourceIdSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);

/** What an effect does to the fight; every field is optional so an effect can be purely descriptive. */
const effectMechanicsShape = {
  /** Lost at the start of each of the character's turns (negative heals). */
  damagePerTurn: z.number().int().min(-MAX_EFFECT_DAMAGE).max(MAX_EFFECT_DAMAGE).default(0),
  /** Status panel resource that takes the damage (e.g. "vida"). */
  damageResourceId: resourceIdSchema.nullable().default(null),
  /** Always acts after everyone without this effect. */
  actsLast: z.boolean().default(false),
  /** Vision shrinks to this distance (scene units); null leaves it alone, 0 blinds. */
  visionLimit: z.number().finite().min(0).max(MAX_VISION_LIMIT).nullable().default(null),
};

export const effectDefinitionSchema = z.object({
  id: localIdSchema,
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).default(""),
  icon: effectIconSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ...effectMechanicsShape,
});
export type EffectDefinition = z.infer<typeof effectDefinitionSchema>;

export const effectDefinitionsSchema = z.array(effectDefinitionSchema).max(MAX_EFFECT_DEFINITIONS);

/** A copy of the definition taken when applied, so later edits to the definition do not change running effects. */
export const appliedEffectSchema = effectDefinitionSchema.omit({ id: true }).extend({
  id: localIdSchema,
  definitionId: localIdSchema,
  turnsLeft: z.number().int().min(1).max(MAX_EFFECT_TURNS),
});
export type AppliedEffect = z.infer<typeof appliedEffectSchema>;

export const actorEffectsSchema = z.array(appliedEffectSchema).max(MAX_ACTOR_EFFECTS);

export function parseEffectDefinitions(value: unknown): EffectDefinition[] {
  const parsed = effectDefinitionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseActorEffects(value: unknown): AppliedEffect[] {
  const parsed = actorEffectsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function hasActsLast(effects: readonly AppliedEffect[]): boolean {
  return effects.some((effect) => effect.actsLast);
}

/** The tightest vision limit among the effects, or null when none limits vision. */
export function strongestVisionLimit(effects: readonly AppliedEffect[]): number | null {
  let limit: number | null = null;
  for (const effect of effects) {
    if (effect.visionLimit !== null && (limit === null || effect.visionLimit < limit)) limit = effect.visionLimit;
  }
  return limit;
}

/** Damage each resource takes when the character's turn starts. */
export function turnStartDamage(effects: readonly AppliedEffect[]): Map<string, number> {
  const damage = new Map<string, number>();
  for (const effect of effects) {
    if (effect.damagePerTurn === 0 || !effect.damageResourceId) continue;
    damage.set(effect.damageResourceId, (damage.get(effect.damageResourceId) ?? 0) + effect.damagePerTurn);
  }
  return damage;
}

/** One turn of the character went by: every effect loses a turn and the ones that ran out are gone. */
export function afterOwnTurn(effects: readonly AppliedEffect[]): AppliedEffect[] {
  return effects.filter((effect) => effect.turnsLeft > 1).map((effect) => ({ ...effect, turnsLeft: effect.turnsLeft - 1 }));
}

/** Applying an effect the character already has refreshes it instead of stacking a copy. */
export function withAppliedEffect(effects: readonly AppliedEffect[], applied: AppliedEffect): AppliedEffect[] {
  const others = effects.filter((effect) => effect.definitionId !== applied.definitionId);
  return [...others, applied].slice(-MAX_ACTOR_EFFECTS);
}

function normalized(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Accent- and case-insensitive search by name or description; an empty query lists everything. */
export function searchEffectDefinitions(definitions: readonly EffectDefinition[], query: string): EffectDefinition[] {
  const wanted = normalized(query);
  if (!wanted) return [...definitions];
  return definitions.filter((definition) => normalized(definition.name).includes(wanted) || normalized(definition.description).includes(wanted));
}

/** Icons offered in the effect editor; the GM may also type an emoji. */
export const EFFECT_ICON_CHOICES: readonly string[] = Object.freeze(
  ["skull-crossbones", "face-dizzy", "eye-slash", "droplet", "fire", "snowflake", "bolt", "biohazard", "spider", "ghost", "brain", "heart-crack", "shield-halved", "bed", "link", "hourglass-half", "burst", "feather", "wand-magic-sparkles", "masks-theater"].map((name) => `fa-solid fa-${name}`),
);

/** Effects every new world starts with; the GM edits or deletes them freely. */
export const STARTER_EFFECT_DEFINITIONS: readonly EffectDefinition[] = Object.freeze([
  { id: "envenenado", name: "Envenenado", description: "Perde vida no começo de cada turno.", icon: "fa-solid fa-skull-crossbones", color: "#3fa34d", damagePerTurn: 2, damageResourceId: "vida", actsLast: false, visionLimit: null },
  { id: "tonto", name: "Tonto", description: "Sempre age por último no combate.", icon: "fa-solid fa-face-dizzy", color: "#d4a017", damagePerTurn: 0, damageResourceId: null, actsLast: true, visionLimit: null },
  { id: "cego", name: "Cego", description: "Enxerga só bem de perto.", icon: "fa-solid fa-eye-slash", color: "#5b5b6b", damagePerTurn: 0, damageResourceId: null, actsLast: false, visionLimit: 1.5 },
  { id: "sangrando", name: "Sangrando", description: "Perde vida no começo de cada turno.", icon: "fa-solid fa-droplet", color: "#b3261e", damagePerTurn: 1, damageResourceId: "vida", actsLast: false, visionLimit: null },
]);
