import { z } from "zod";

/** Flag keys (scope "world") on tiles and notes. */
export const PERCEPTION_DC_FLAG = "perceptionDc";
export const TRAP_FLAG = "trap";
export const PERCEPTION_SCORES_SETTING_KEY = "world.perceptionScores";

export const MAX_PERCEPTION = 99;
export const MAX_TRAP_TURNS = 99;

export const perceptionDcSchema = z.number().int().min(1).max(MAX_PERCEPTION);

export const trapSchema = z.object({
  name: z.string().trim().min(1).max(60),
  message: z.string().trim().max(200).default(""),
  effectId: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable().default(null),
  effectTurns: z.number().int().min(1).max(MAX_TRAP_TURNS).default(3),
  triggered: z.boolean().default(false),
});
export type Trap = z.infer<typeof trapSchema>;

/** Character id -> perception the GM wrote down for it. */
export const perceptionScoresSchema = z.record(z.string().regex(/^[A-Za-z0-9]{1,32}$/), z.number().int().min(0).max(MAX_PERCEPTION));
export type PerceptionScores = z.infer<typeof perceptionScoresSchema>;

export interface Concealment {
  perceptionDc: number | null;
  trap: Trap | null;
}

export function readConcealment(worldFlags: unknown): Concealment {
  const flags = (worldFlags && typeof worldFlags === "object" ? worldFlags : {}) as Record<string, unknown>;
  const dc = perceptionDcSchema.safeParse(flags[PERCEPTION_DC_FLAG]);
  const trap = trapSchema.safeParse(flags[TRAP_FLAG]);
  return { perceptionDc: dc.success ? dc.data : null, trap: trap.success ? trap.data : null };
}

export function parsePerceptionScores(value: unknown): PerceptionScores {
  const parsed = perceptionScoresSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/**
 * Whether a player with this perception (null when the GM wrote none) misses the object. An armed trap stays hidden
 * unless they beat its DC; a triggered trap is in plain view; anything else with a DC needs the DC to be reached.
 */
export function isConcealedFrom(concealment: Concealment, perception: number | null): boolean {
  const { perceptionDc, trap } = concealment;
  const beatsDc = perceptionDc !== null && perception !== null && perception >= perceptionDc;
  if (trap) return !trap.triggered && !beatsDc;
  return perceptionDc !== null && !beatsDc;
}

export function isArmedTrap(concealment: Concealment): boolean {
  return concealment.trap !== null && !concealment.trap.triggered;
}
