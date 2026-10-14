import type { UserRole } from "./constants";

export interface PublicUserRecord {
  _id: string;
  name: string;
  role: UserRole;
  color: string;
  avatar: string | null;
  character: string | null;
  flags: Record<string, unknown>;
}

export interface WorldSummaryRecord {
  id: string;
  title: string;
  created: string;
  active: boolean;
}

export interface JoinableUserRecord {
  _id: string;
  name: string;
  isGameMaster: boolean;
  /** Name of the player's linked character, so returning players recognize their entry; null for GMs. */
  characterName: string | null;
  /** False for a Game Master who chose to play without a password. */
  hasPassword: boolean;
}

export interface BanRecord {
  _id: string;
  name: string;
  bannedAt: number;
}

export interface OnlineUserRecord extends PublicUserRecord {
  active: boolean;
}

export type PackageType = "module" | "system";

export interface PackageLanguageRecord {
  lang: string;
  name?: string;
  path: string;
}

export interface PackageRecord {
  id: string;
  type: PackageType;
  title: string;
  version: string;
  description: string;
  esmodules: string[];
  scripts: string[];
  styles: string[];
  languages: PackageLanguageRecord[];
  active: boolean;
  manifestData: Record<string, unknown>;
}

export interface SettingRecord {
  _id: string;
  key: string;
  value: string;
  user: string | null;
}

export interface WorldRecord {
  id: string;
  title: string;
  description: string;
  system: string | null;
  coreVersion: string;
}

export interface ReleaseRecord {
  generation: number;
  channel: string;
  suffix: string;
  build: number;
  version: string;
}

export type DocumentSource = Record<string, unknown> & { _id: string };

/** Template defaults per document name and subtype, mirroring Foundry's `game.model`. */
export type DocumentModelTemplates = Record<string, Record<string, Record<string, unknown>>>;

export interface WorldSnapshot {
  userId: string;
  world: WorldRecord;
  system: PackageRecord | null;
  modules: PackageRecord[];
  users: OnlineUserRecord[];
  settings: SettingRecord[];
  release: ReleaseRecord;
  /** Keyed by collection name (actors, items, journal, folders); already filtered for this user. */
  documents: Record<string, DocumentSource[]>;
  model: DocumentModelTemplates;
}

export type ModifyDocumentAction = "create" | "update" | "delete";

export interface ModifyDocumentResponse {
  type: string;
  action: ModifyDocumentAction;
  userId: string;
  operation: Record<string, unknown> & { parentUuid?: string | null };
  /** Created sources, update diffs (with `_id`), or deleted ids depending on `action`. */
  result: Array<Record<string, unknown>> | string[];
}

export interface ModifyDocumentAck {
  response?: ModifyDocumentResponse;
  error?: string;
}

export interface ServerStatusResponse {
  configured: boolean;
  world: { id: string; title: string } | null;
  isLocalRequest: boolean;
}

export interface SessionResponse {
  userId: string;
}

export interface ApiErrorResponse {
  error: string;
}
