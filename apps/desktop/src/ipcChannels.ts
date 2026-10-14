import type { FirewallStatus } from "./firewall";
import type { InviteAddress } from "./inviteAddresses";

export const IPC_CHANNELS = Object.freeze({
  getLauncherState: "launcher:get-state",
  openTable: "launcher:open-table",
  copyText: "launcher:copy-text",
  allowFirewall: "launcher:allow-firewall",
  openDataFolder: "launcher:open-data-folder",
  listRooms: "launcher:list-rooms",
  createRoom: "launcher:create-room",
  openRoom: "launcher:open-room",
  stateChanged: "launcher:changed",
});

export interface RoomSummary {
  id: string;
  title: string;
  created: string;
  active: boolean;
}

export type RoomsResult<T> = { ok: true; value: T } | { ok: false; error: string };

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
  listRooms(): Promise<RoomsResult<RoomSummary[]>>;
  createRoom(title: string): Promise<RoomsResult<{ id: string }>>;
  openRoom(worldId: string): Promise<RoomsResult<{ id: string }>>;
  onStateChanged(listener: () => void): void;
}
