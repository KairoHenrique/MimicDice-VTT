import type { ClientSettings } from "@tabbletop/api";
import {
  DEFAULT_STATUS_RESOURCES,
  mayMoveUnownedToken,
  parseStatusResources,
  parseTokenMoveRule,
  type StatusResource,
  TOKEN_MOVE_RULE_SETTING_KEY,
  type TokenMoveRule,
} from "@tabbletop/protocol";

const [RULES_NAMESPACE, TOKEN_MOVE_RULE_KEY] = TOKEN_MOVE_RULE_SETTING_KEY.split(".") as [string, string];
const STATUS_RESOURCES_KEY = "statusResources";
const STATUS_PANEL_FOR_PLAYERS_KEY = "statusPanelForPlayers";
const TURN_MOVEMENT_FOR_PLAYERS_KEY = "turnMovementForPlayers";

/** Fired whenever the GM changes a rule that changes what the status panel or the combat tab show. */
export const TABLE_RULES_CHANGED_HOOK = "tableRulesChanged";

function announceRulesChanged(): void {
  Hooks.callAll(TABLE_RULES_CHANGED_HOOK);
}

function refreshTokenCursors(): void {
  for (const token of canvas?.tokens?.placeables ?? []) token.refresh?.();
}

export function registerTableRuleSettings(settings: ClientSettings): void {
  settings.register(RULES_NAMESPACE, TOKEN_MOVE_RULE_KEY, {
    name: "Quem pode arrastar tokens",
    scope: "world",
    config: false,
    type: String,
    default: "owner",
    onChange: () => refreshTokenCursors(),
  });
  settings.register(RULES_NAMESPACE, STATUS_RESOURCES_KEY, {
    name: "Vida, PE e sanidade no painel",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_STATUS_RESOURCES.map((resource) => ({ ...resource, aliases: [...resource.aliases] })),
    onChange: announceRulesChanged,
  });
  settings.register(RULES_NAMESPACE, STATUS_PANEL_FOR_PLAYERS_KEY, {
    name: "Jogadores veem o painel de status",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: announceRulesChanged,
  });
  settings.register(RULES_NAMESPACE, TURN_MOVEMENT_FOR_PLAYERS_KEY, {
    name: "Jogadores veem quanto o personagem da vez andou",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: () => {
      announceRulesChanged();
      void ui.combat?.render();
    },
  });
}

export function tokenMoveRule(): TokenMoveRule {
  return parseTokenMoveRule(game.settings.get(RULES_NAMESPACE, TOKEN_MOVE_RULE_KEY));
}

export function setTokenMoveRule(rule: TokenMoveRule): Promise<unknown> {
  return game.settings.set(RULES_NAMESPACE, TOKEN_MOVE_RULE_KEY, rule);
}

export function statusResources(): StatusResource[] {
  return parseStatusResources(game.settings.get(RULES_NAMESPACE, STATUS_RESOURCES_KEY));
}

export function setStatusResources(resources: StatusResource[]): Promise<unknown> {
  return game.settings.set(RULES_NAMESPACE, STATUS_RESOURCES_KEY, parseStatusResources(resources));
}

export function playersSeeStatusPanel(): boolean {
  return game.settings.get(RULES_NAMESPACE, STATUS_PANEL_FOR_PLAYERS_KEY) !== false;
}

export function setPlayersSeeStatusPanel(visible: boolean): Promise<unknown> {
  return game.settings.set(RULES_NAMESPACE, STATUS_PANEL_FOR_PLAYERS_KEY, visible);
}

export function playersSeeTurnMovement(): boolean {
  return game.settings.get(RULES_NAMESPACE, TURN_MOVEMENT_FOR_PLAYERS_KEY) !== false;
}

export function setPlayersSeeTurnMovement(visible: boolean): Promise<unknown> {
  return game.settings.set(RULES_NAMESPACE, TURN_MOVEMENT_FOR_PLAYERS_KEY, visible);
}

/** The board lets players drag what the server would accept, so a forbidden drag never starts. */
export function installTokenDragRule(): void {
  const tokenClass = CONFIG.Token?.objectClass;
  if (!tokenClass) return;
  tokenClass.dragWithoutControlRule = (token: any) => {
    const source = token.document._source ?? {};
    return mayMoveUnownedToken({ rule: tokenMoveRule(), token: source, linkedActor: visibleLinkedActor(source) });
  };
}

function visibleLinkedActor(tokenSource: { actorId?: unknown }): Record<string, unknown> | null | undefined {
  if (typeof tokenSource.actorId !== "string") return null;
  return game.actors?.get(tokenSource.actorId)?._source;
}
