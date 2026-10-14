export const PRODUCT_NAME = "MimicDice VTT";

export const CORE_RELEASE = Object.freeze({
  generation: 13,
  channel: "stable",
  suffix: "",
  build: 351,
  version: "13.351",
});

export const USER_ROLES = Object.freeze({
  NONE: 0,
  PLAYER: 1,
  TRUSTED: 2,
  ASSISTANT: 3,
  GAMEMASTER: 4,
});

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/** World setting (JSON boolean) that freezes every scene for non-GM users. */
export const MAP_LOCKED_SETTING_KEY = "core.mapLocked";

export const SOCKET_EVENTS = Object.freeze({
  WORLD: "world",
  MODIFY_SETTING: "modifySetting",
  SETTING_UPDATED: "settingUpdated",
  USER_ACTIVITY: "userActivity",
  SESSION_ENDED: "sessionEnded",
  MODIFY_DOCUMENT: "modifyDocument",
  WORLD_RELOADED: "worldReloaded",
  PULL_TO_SCENE: "pullToScene",
  CANVAS_PING: "canvasPing",
});

export const MAX_DOCUMENT_BYTES = 1024 * 1024;

export const MAX_DOCUMENTS_PER_OPERATION = 200;

export const PACKAGE_EVENT_PREFIXES = Object.freeze(["module.", "system."]);

export const SESSION_COOKIE_NAME = "tabbletop_session";

export const DEFAULT_SERVER_PORT = 30000;

export const PACKAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const SETTING_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_.-]{1,128}$/;

export const MAX_SETTING_VALUE_BYTES = 256 * 1024;

export const MAX_PACKAGE_EVENT_BYTES = 512 * 1024;
