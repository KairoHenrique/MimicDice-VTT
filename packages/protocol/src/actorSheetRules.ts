import { z } from "zod";
import { ACTOR_EFFECTS_FLAG, actorEffectsSchema } from "./combatEffects";
import { imagePathSchema, storedSheetLayoutSchema } from "./sheetLayout";

/** World setting (JSON boolean): players may edit the layout of the sheets they own and pick any model. */
export const PLAYER_SHEET_EDITING_SETTING_KEY = "core.playerSheetEditing";

/** Actor flags (scope `world`). */
export const SHEET_LAYOUT_FLAG = "sheetLayout";
export const SHEET_VARIANTS_FLAG = "sheetVariants";
export const APPEARANCES_FLAG = "appearances";
export const ACTIVE_APPEARANCE_FLAG = "activeAppearance";

export const MAX_SHEET_VARIANTS = 5;
export const MAX_APPEARANCES = 5;

const localIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const nameSchema = z.string().trim().min(1).max(60);

/** Sheet models the GM handed to one actor; a player may switch only between these. */
export const sheetVariantsSchema = z
  .array(z.object({ id: localIdSchema, name: nameSchema, layout: storedSheetLayoutSchema }))
  .max(MAX_SHEET_VARIANTS);
export type SheetVariant = z.infer<typeof sheetVariantsSchema>[number];

export const appearancesSchema = z.array(z.object({ id: localIdSchema, name: nameSchema, img: imagePathSchema })).max(MAX_APPEARANCES);
export type ActorAppearance = z.infer<typeof appearancesSchema>[number];

function worldFlags(source: unknown): Record<string, unknown> {
  const scope = (source as { flags?: { world?: unknown } } | null | undefined)?.flags?.world;
  return scope && typeof scope === "object" ? (scope as Record<string, unknown>) : {};
}

/** Order-insensitive for object keys, so a layout that went through a merge still compares equal. */
export function isSameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    const rightArray = right as unknown[];
    return left.length === rightArray.length && left.every((entry, index) => isSameJson(entry, rightArray[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined);
  const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => isSameJson(leftRecord[key], rightRecord[key]));
}

/** Writing a current layout over an older one leaves its old keys behind; only the current shape counts. */
function layoutCore(layout: unknown): unknown {
  const record = layout as { version?: unknown; pages?: unknown } | null | undefined;
  return record?.version === 2 ? { version: 2, pages: record.pages } : layout;
}

function refusedGameMasterChange(next: Record<string, unknown>): string | null {
  if (!sheetVariantsSchema.safeParse(next[SHEET_VARIANTS_FLAG] ?? []).success) return "Modelos de ficha inválidos";
  return actorEffectsSchema.safeParse(next[ACTOR_EFFECTS_FLAG] ?? []).success ? null : "Efeitos inválidos";
}

export interface ActorSheetChange {
  isGameMaster: boolean;
  playerEditingAllowed: boolean;
  before: unknown;
  after: unknown;
}

/**
 * Why a change to an actor's sheet or looks is refused, or null when it is allowed. Players never touch the models
 * the GM handed out; they change the layout only when the GM allows editing, when it becomes one of those models,
 * or when the actor has no sheet yet (it gets the default one).
 */
export function refusedActorChange({ isGameMaster, playerEditingAllowed, before, after }: ActorSheetChange): string | null {
  const previous = worldFlags(before);
  const next = worldFlags(after);
  if (!appearancesSchema.safeParse(next[APPEARANCES_FLAG] ?? []).success) return "Aparências inválidas";
  if (isGameMaster) return refusedGameMasterChange(next);
  if (!isSameJson(previous[SHEET_VARIANTS_FLAG], next[SHEET_VARIANTS_FLAG])) return "Só o mestre escolhe os modelos de ficha";
  if (!isSameJson(previous[ACTOR_EFFECTS_FLAG], next[ACTOR_EFFECTS_FLAG])) return "Só o mestre aplica ou remove efeitos";
  const layoutBefore = previous[SHEET_LAYOUT_FLAG];
  const layoutAfter = next[SHEET_LAYOUT_FLAG];
  if (playerEditingAllowed || layoutBefore === undefined || isSameJson(layoutBefore, layoutAfter)) return null;
  const variants = sheetVariantsSchema.safeParse(previous[SHEET_VARIANTS_FLAG] ?? []);
  if (variants.success && variants.data.some((variant) => isSameJson(layoutCore(variant.layout), layoutCore(layoutAfter)))) return null;
  return "O mestre não liberou mudar esta ficha";
}
