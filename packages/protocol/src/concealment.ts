import { z } from "zod";
import { effectTurnsSchema } from "./combatEffects";

/** Flag keys (scope "world") on tiles and notes. */
export const PERCEPTION_DC_FLAG = "perceptionDc";
export const TRAP_FLAG = "trap";
/** Set by the GM to show a hidden object (or an armed trap) to everyone, whatever their perception. */
export const REVEALED_FLAG = "revealed";
/** Flag key (scope "world") on scenes: perception is rolled again in every scene, so each one keeps its own. */
export const PERCEPTION_SCORES_FLAG = "perceptionScores";

export const MAX_PERCEPTION = 99;
export const MAX_TRAP_TURNS = 99;

export const perceptionDcSchema = z.number().int().min(1).max(MAX_PERCEPTION);

export const trapSchema = z.object({
  name: z.string().trim().min(1).max(60),
  message: z.string().trim().max(200).default(""),
  effectId: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().default(null),
  effectTurns: effectTurnsSchema.default(3),
  triggered: z.boolean().default(false),
});
export type Trap = z.infer<typeof trapSchema>;

/** Character id -> perception the GM wrote down for it. */
export const perceptionScoresSchema = z.record(z.string().regex(/^[A-Za-z0-9]{1,32}$/), z.number().int().min(0).max(MAX_PERCEPTION));
export type PerceptionScores = z.infer<typeof perceptionScoresSchema>;

export interface Concealment {
  perceptionDc: number | null;
  trap: Trap | null;
  revealed: boolean;
}

export function readConcealment(worldFlags: unknown): Concealment {
  const flags = (worldFlags && typeof worldFlags === "object" ? worldFlags : {}) as Record<string, unknown>;
  const dc = perceptionDcSchema.safeParse(flags[PERCEPTION_DC_FLAG]);
  const trap = trapSchema.safeParse(flags[TRAP_FLAG]);
  return { perceptionDc: dc.success ? dc.data : null, trap: trap.success ? trap.data : null, revealed: flags[REVEALED_FLAG] === true };
}

/** Whether there is anything to reveal: a perception DC or a trap that is not already in plain view. */
export function canBeRevealed(concealment: Concealment): boolean {
  return concealment.perceptionDc !== null || (concealment.trap !== null && !concealment.trap.triggered);
}

export function parsePerceptionScores(value: unknown): PerceptionScores {
  const parsed = perceptionScoresSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** Scores written down for one scene, read from the scene's "world" flags. */
export function scenePerceptionScores(sceneWorldFlags: unknown): PerceptionScores {
  const flags = sceneWorldFlags && typeof sceneWorldFlags === "object" ? (sceneWorldFlags as Record<string, unknown>) : {};
  return parsePerceptionScores(flags[PERCEPTION_SCORES_FLAG]);
}

/** Update keys that turn the stored scores into the next ones, removing characters whose field was cleared. */
export function perceptionScoresUpdate(stored: PerceptionScores, next: PerceptionScores): Record<string, number | null> {
  const prefix = `flags.world.${PERCEPTION_SCORES_FLAG}`;
  const update: Record<string, number | null> = {};
  for (const [actorId, score] of Object.entries(perceptionScoresSchema.parse(next))) update[`${prefix}.${actorId}`] = score;
  for (const actorId of Object.keys(stored)) if (!(actorId in next)) update[`${prefix}.-=${actorId}`] = null;
  return update;
}

/**
 * Whether a player with this perception (null when the GM wrote none) misses the object. An armed trap stays hidden
 * unless they beat its DC; a triggered trap is in plain view; anything else with a DC needs the DC to be reached.
 * Whatever the GM revealed is seen by everyone.
 */
export function isConcealedFrom(concealment: Concealment, perception: number | null): boolean {
  const { perceptionDc, trap } = concealment;
  if (concealment.revealed) return false;
  const beatsDc = perceptionDc !== null && perception !== null && perception >= perceptionDc;
  if (trap) return !trap.triggered && !beatsDc;
  return perceptionDc !== null && !beatsDc;
}

export function isArmedTrap(concealment: Concealment): boolean {
  return concealment.trap !== null && !concealment.trap.triggered;
}
