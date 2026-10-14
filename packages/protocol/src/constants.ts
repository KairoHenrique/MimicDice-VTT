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

/** World setting (JSON boolean): the GM paused the scene; players cannot act on it and its view is covered. */
export const SCENE_PAUSED_SETTING_KEY = "core.scenePaused";

/**
 * World setting (JSON boolean): the GM started the game session. Anything but `true` means closed: players keep
 * their last view of the board and cannot act on scenes, only on their own sheet and dice.
 */
export const TABLE_SESSION_OPEN_SETTING_KEY = "core.tableSessionOpen";

/** An open session with no input from anyone for this long is closed by the server. */
export const TABLE_SESSION_IDLE_CLOSE_MS = 60 * 60 * 1000;

/** Clients report user input at most this often, so idle detection costs one tiny message per minute. */
export const TABLE_ACTIVITY_REPORT_INTERVAL_MS = 60 * 1000;

/** World setting (JSON number, scene distance units): how far players see around their tokens; 0 = no limit. */
export const PLAYER_VISION_LIMIT_SETTING_KEY = "core.playerVisionLimit";
export const MAX_PLAYER_VISION_LIMIT = 1000;

/** Each user may ping at most this many times inside any window of `PING_WINDOW_MS`. */
export const MAX_PINGS_PER_WINDOW = 3;
export const PING_WINDOW_MS = 5_000;

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
  TOKEN_DRAG: "tokenDrag",
  TABLE_ACTIVITY: "tableActivity",
  LOOT_PICKUP: "lootPickup",
  LOOT_DROP: "lootDrop",
  ITEM_TRANSFER: "itemTransfer",
  CHEST_TAKE: "chestTake",
  CHEST_PUT: "chestPut",
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
