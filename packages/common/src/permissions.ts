import { USER_ROLES } from "@tabbletop/protocol";

export const DOCUMENT_OWNERSHIP_LEVELS = Object.freeze({ INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 });

export type OwnershipLevel = (typeof DOCUMENT_OWNERSHIP_LEVELS)[keyof typeof DOCUMENT_OWNERSHIP_LEVELS];

export type OwnershipMap = Record<string, number>;

export const USER_PERMISSIONS = Object.freeze({
  /* Players create their own characters at this table, so the default is lower than Foundry's. */
  ACTOR_CREATE: { label: "PERMISSION.ActorCreate", defaultRole: USER_ROLES.PLAYER },
  BROADCAST_AUDIO: { label: "PERMISSION.BroadcastAudio", defaultRole: USER_ROLES.TRUSTED },
  BROADCAST_VIDEO: { label: "PERMISSION.BroadcastVideo", defaultRole: USER_ROLES.TRUSTED },
  CARDS_CREATE: { label: "PERMISSION.CardsCreate", defaultRole: USER_ROLES.ASSISTANT },
  /* Players sketch on the shared board; the GM can lock or erase any drawing. */
  DRAWING_CREATE: { label: "PERMISSION.DrawingCreate", defaultRole: USER_ROLES.PLAYER },
  /* Players upload their own portraits and tokens; uploads are confined to an allowlisted, sandboxed folder. */
  FILES_BROWSE: { label: "PERMISSION.FilesBrowse", defaultRole: USER_ROLES.PLAYER },
  FILES_UPLOAD: { label: "PERMISSION.FilesUpload", defaultRole: USER_ROLES.PLAYER },
  ITEM_CREATE: { label: "PERMISSION.ItemCreate", defaultRole: USER_ROLES.ASSISTANT },
  JOURNAL_CREATE: { label: "PERMISSION.JournalCreate", defaultRole: USER_ROLES.TRUSTED },
  MACRO_SCRIPT: { label: "PERMISSION.MacroScript", defaultRole: USER_ROLES.PLAYER },
  MANUAL_ROLLS: { label: "PERMISSION.ManualRolls", defaultRole: USER_ROLES.TRUSTED },
  MESSAGE_WHISPER: { label: "PERMISSION.MessageWhisper", defaultRole: USER_ROLES.PLAYER },
  NOTE_CREATE: { label: "PERMISSION.NoteCreate", defaultRole: USER_ROLES.TRUSTED },
  PING_CANVAS: { label: "PERMISSION.PingCanvas", defaultRole: USER_ROLES.PLAYER },
  PLAYLIST_CREATE: { label: "PERMISSION.PlaylistCreate", defaultRole: USER_ROLES.ASSISTANT },
  QUERY_USER: { label: "PERMISSION.QueryUser", defaultRole: USER_ROLES.PLAYER },
  SETTINGS_MODIFY: { label: "PERMISSION.SettingsModify", defaultRole: USER_ROLES.ASSISTANT },
  SHOW_CURSOR: { label: "PERMISSION.ShowCursor", defaultRole: USER_ROLES.PLAYER },
  SHOW_RULER: { label: "PERMISSION.ShowRuler", defaultRole: USER_ROLES.PLAYER },
  TEMPLATE_CREATE: { label: "PERMISSION.TemplateCreate", defaultRole: USER_ROLES.PLAYER },
  TOKEN_CONFIGURE: { label: "PERMISSION.TokenConfigure", defaultRole: USER_ROLES.TRUSTED },
  TOKEN_CREATE: { label: "PERMISSION.TokenCreate", defaultRole: USER_ROLES.ASSISTANT },
  TOKEN_DELETE: { label: "PERMISSION.TokenDelete", defaultRole: USER_ROLES.ASSISTANT },
  WALL_DOORS: { label: "PERMISSION.WallDoors", defaultRole: USER_ROLES.PLAYER },
});

export type UserPermissionName = keyof typeof USER_PERMISSIONS;

export type ConfiguredPermissions = Partial<Record<string, number[]>>;

export function isGameMasterRole(role: number): boolean {
  return role >= USER_ROLES.ASSISTANT;
}

export function roleHasPermission(role: number, permission: UserPermissionName, configured: ConfiguredPermissions = {}): boolean {
  if (role === USER_ROLES.GAMEMASTER) return true;
  const allowedRoles = configured[permission];
  if (Array.isArray(allowedRoles)) return allowedRoles.includes(role);
  return role >= USER_PERMISSIONS[permission].defaultRole;
}

/** Resolves a user's ownership level; INHERIT falls back to `default`, then to `inheritedLevel` (the parent's level). */
export function resolveOwnershipLevel(ownership: OwnershipMap | undefined, userId: string, isGameMaster: boolean, inheritedLevel: number = DOCUMENT_OWNERSHIP_LEVELS.NONE): number {
  if (isGameMaster) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const explicitLevel = ownership?.[userId];
  if (explicitLevel !== undefined && explicitLevel !== DOCUMENT_OWNERSHIP_LEVELS.INHERIT) return explicitLevel;
  const defaultLevel = ownership?.default;
  if (defaultLevel !== undefined && defaultLevel !== DOCUMENT_OWNERSHIP_LEVELS.INHERIT) return defaultLevel;
  return inheritedLevel;
}
