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
  deleteRoom: "launcher:delete-room",
  renameRoom: "launcher:rename-room",
  checkUpdate: "launcher:check-update",
  installUpdate: "launcher:install-update",
  setTunnel: "launcher:set-tunnel",
  openExternal: "launcher:open-external",
  stateChanged: "launcher:changed",
});

export type TunnelPhase = "off" | "downloading" | "starting" | "on" | "error";

export interface TunnelStatus {
  phase: TunnelPhase;
  url?: string;
  percent?: number;
  error?: string;
}

export type UpdatePhase = "disabled" | "idle" | "checking" | "latest" | "downloading" | "ready" | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  version?: string;
  percent?: number;
  releaseNotes?: string;
}

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
  update: UpdateStatus;
  tunnel: TunnelStatus;
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
  deleteRoom(worldId: string, password: string): Promise<RoomsResult<{ id: string }>>;
  renameRoom(worldId: string, title: string, password: string): Promise<RoomsResult<{ id: string }>>;
  checkUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  setTunnel(enabled: boolean): Promise<void>;
  openExternal(url: string): Promise<void>;
  onStateChanged(listener: () => void): void;
}
