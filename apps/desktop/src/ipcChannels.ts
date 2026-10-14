import type { FirewallStatus } from "./firewall";
import type { InviteAddress } from "./inviteAddresses";

export const IPC_CHANNELS = Object.freeze({
  getLauncherState: "launcher:get-state",
  openTable: "launcher:open-table",
  copyText: "launcher:copy-text",
  allowFirewall: "launcher:allow-firewall",
  openDataFolder: "launcher:open-data-folder",
  stateChanged: "launcher:changed",
});

export type ServerState = "starting" | "running" | "failed";

export interface LauncherState {
  serverState: ServerState;
  serverError: string | null;
  localUrl: string;
  port: number;
  invites: InviteAddress[];
  firewall: FirewallStatus;
  version: string;
}

export interface DesktopBridge {
  getLauncherState(): Promise<LauncherState>;
  openTable(): Promise<void>;
  copyText(text: string): Promise<void>;
  allowFirewall(): Promise<FirewallStatus>;
  openDataFolder(): Promise<void>;
  onStateChanged(listener: () => void): void;
}
