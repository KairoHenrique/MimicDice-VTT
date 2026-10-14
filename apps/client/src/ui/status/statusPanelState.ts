import type { ClientSettings } from "@tabbletop/api";
import { parseStatusPanelState, type StatusPanelMode, type StatusPanelState } from "@tabbletop/protocol";

const NAMESPACE = "core";
const STATE_KEY = "statusPanel";

export const STATUS_PANEL_MODE_LABELS: Readonly<Record<StatusPanelMode, string>> = Object.freeze({
  players: "Personagens dos jogadores",
  combat: "Quem está no combate",
  scene: "Todos os tokens desta cena",
  custom: "Escolher um por um",
});

/** Fired when this user's panel settings change (position, open, who is listed). */
export const STATUS_PANEL_STATE_HOOK = "statusPanelStateChanged";

export function registerStatusPanelState(settings: ClientSettings): void {
  settings.register(NAMESPACE, STATE_KEY, {
    name: "Painel de status",
    scope: "client",
    config: false,
    type: Object,
    default: parseStatusPanelState({}),
    onChange: () => Hooks.callAll(STATUS_PANEL_STATE_HOOK),
  });
}

export function readStatusPanelState(): StatusPanelState {
  return parseStatusPanelState(game.settings.get(NAMESPACE, STATE_KEY));
}

export function updateStatusPanelState(changes: Partial<StatusPanelState>): Promise<unknown> {
  return game.settings.set(NAMESPACE, STATE_KEY, parseStatusPanelState({ ...readStatusPanelState(), ...changes }));
}

export function isStatusPanelOpen(): boolean {
  return readStatusPanelState().open;
}

export function toggleStatusPanel(): Promise<unknown> {
  return updateStatusPanelState({ open: !readStatusPanelState().open, collapsed: false });
}
