import { z } from "zod";

/** World setting (JSON string): who may drag a token they do not control. */
export const TOKEN_MOVE_RULE_SETTING_KEY = "core.tokenMoveRule";

/** "owner": only whoever controls the token; "party": players may also drag the other players' characters. */
export const TOKEN_MOVE_RULES = ["owner", "party"] as const;
export type TokenMoveRule = (typeof TOKEN_MOVE_RULES)[number];

/** Token flag (scope `world`) the GM sets so any player may drag that token, without getting its sheet. */
export const TOKEN_FREE_MOVE_FLAG = "freeMove";
export const ACTOR_ROLE_FLAG = "role";
export const WORLD_FLAG_SCOPE = "world";

const MOVE_ONLY_KEYS: ReadonlySet<string> = new Set(["_id", "x", "y"]);

export function parseTokenMoveRule(value: unknown): TokenMoveRule {
  return (TOKEN_MOVE_RULES as readonly unknown[]).includes(value) ? (value as TokenMoveRule) : "owner";
}

function worldFlag(source: unknown, key: string): unknown {
  const flags = (source as { flags?: Record<string, unknown> } | null | undefined)?.flags;
  const scope = flags?.[WORLD_FLAG_SCOPE];
  return scope && typeof scope === "object" ? (scope as Record<string, unknown>)[key] : undefined;
}

/** True when the change only moves the token (no rotation, size, image, visibility...). */
export function isMoveOnlyChange(changes: Record<string, unknown>): boolean {
  const keys = Object.keys(changes);
  return keys.some((key) => key === "x" || key === "y") && keys.every((key) => MOVE_ONLY_KEYS.has(key));
}

export interface UnownedTokenMove {
  rule: TokenMoveRule;
  token: Record<string, unknown>;
  /** `undefined` when the caller cannot see the actor (players only receive actors they may observe); `null` when there is none. */
  linkedActor: Record<string, unknown> | null | undefined;
}

const FRIENDLY_DISPOSITION = 1;

function isPartyToken(token: Record<string, unknown>, linkedActor: Record<string, unknown> | null | undefined): boolean {
  if (linkedActor !== undefined) return worldFlag(linkedActor, ACTOR_ROLE_FLAG) === "player";
  return token.actorLink === true && token.disposition === FRIENDLY_DISPOSITION;
}

/** Whether a player who does not control a visible, unlocked token may still drag it, per the GM's rules. */
export function mayMoveUnownedToken({ rule, token, linkedActor }: UnownedTokenMove): boolean {
  if (token.hidden === true || token.locked === true) return false;
  if (worldFlag(token, TOKEN_FREE_MOVE_FLAG) === true) return true;
  return rule === "party" && isPartyToken(token, linkedActor);
}

const MAX_STATUS_RESOURCES = 6;

export const statusResourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,32}$/),
  label: z.string().trim().min(1).max(40),
  aliases: z.array(z.string().trim().min(1).max(64)).max(12),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  enabled: z.boolean(),
  playersSee: z.boolean().default(true),
});

export const statusResourcesSchema = z.array(statusResourceSchema).max(MAX_STATUS_RESOURCES);
export type StatusResource = z.infer<typeof statusResourceSchema>;
export const MAX_STATUS_RESOURCE_COUNT = MAX_STATUS_RESOURCES;

/** Sheet bars (or plain numbers) the status panel reads, matched by field key or label (accents and case ignored). */
export const DEFAULT_STATUS_RESOURCES: readonly StatusResource[] = Object.freeze([
  { id: "vida", label: "Vida", aliases: ["vida", "hp", "pv", "pontos_de_vida"], color: "#c0392b", enabled: true, playersSee: true },
  { id: "pe", label: "PE", aliases: ["pe", "pontos_de_esforco", "esforco"], color: "#2f80d1", enabled: true, playersSee: true },
  { id: "sanidade", label: "Sanidade", aliases: ["sanidade", "san"], color: "#7d5fff", enabled: true, playersSee: true },
]);

export const STATUS_PANEL_MODES = ["players", "combat", "scene", "custom"] as const;
export type StatusPanelMode = (typeof STATUS_PANEL_MODES)[number];
const MAX_PICKED_ACTORS = 60;

/** One user's floating status panel: where it sits, whether it is open, and (GM) whose bars it lists. */
const statusPanelStateSchema = z.object({
  open: z.boolean().catch(true),
  collapsed: z.boolean().catch(false),
  left: z.number().finite().min(0).max(20_000).catch(104),
  top: z.number().finite().min(0).max(20_000).catch(120),
  mode: z.enum(STATUS_PANEL_MODES).catch("players"),
  actorIds: z.array(z.string().regex(/^[A-Za-z0-9]{1,64}$/)).max(MAX_PICKED_ACTORS).catch([]),
});
export type StatusPanelState = z.infer<typeof statusPanelStateSchema>;

export function parseStatusPanelState(value: unknown): StatusPanelState {
  return statusPanelStateSchema.parse(value && typeof value === "object" ? value : {});
}

export function parseStatusResources(value: unknown): StatusResource[] {
  const parsed = statusResourcesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_STATUS_RESOURCES.map((resource) => ({ ...resource, aliases: [...resource.aliases] }));
}
