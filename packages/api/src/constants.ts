import { DOCUMENT_OWNERSHIP_LEVELS, USER_PERMISSIONS } from "@tabbletop/common";
import { CORE_RELEASE, USER_ROLES } from "@tabbletop/protocol";

const deepFreeze = <T extends object>(target: T): T => {
  for (const value of Object.values(target)) {
    if (value && typeof value === "object") deepFreeze(value);
  }
  return Object.freeze(target);
};

export const CONST = deepFreeze({
  vtt: "MimicDice VTT",
  VTT: "MimicDice VTT",
  WEBSITE_URL: "",
  CORE_RELEASE_GENERATION: CORE_RELEASE.generation,
  USER_ROLES: { ...USER_ROLES },
  USER_ROLE_NAMES: { 0: "NONE", 1: "PLAYER", 2: "TRUSTED", 3: "ASSISTANT", 4: "GAMEMASTER" },
  DOCUMENT_OWNERSHIP_LEVELS: { ...DOCUMENT_OWNERSHIP_LEVELS },
  DOCUMENT_META_OWNERSHIP_LEVELS: { DEFAULT: -20, NOCHANGE: -10 },
  USER_PERMISSIONS: structuredClone(USER_PERMISSIONS),
  ACTIVE_EFFECT_MODES: { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 },
  BASE_DOCUMENT_TYPE: "base",
  DEFAULT_TOKEN: "icons/svg/mystery-man.svg",
  FOLDER_DOCUMENT_TYPES: ["Actor", "Adventure", "Item", "Scene", "JournalEntry", "Playlist", "RollTable", "Cards", "Macro", "Compendium"],
  FOLDER_MAX_DEPTH: 4,
  WORLD_DOCUMENT_TYPES: ["Actor", "Cards", "ChatMessage", "Combat", "FogExploration", "Folder", "Item", "JournalEntry", "Macro", "Playlist", "RollTable", "Scene", "Setting", "User"],
  JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1, MARKDOWN: 2 },
  CHAT_MESSAGE_STYLES: { OTHER: 0, OOC: 1, IC: 2, EMOTE: 3 },
  DICE_ROLL_MODES: { PUBLIC: "publicroll", PRIVATE: "gmroll", BLIND: "blindroll", SELF: "selfroll" },
  KEYBINDING_PRECEDENCE: { PRIORITY: 0, NORMAL: 1, DEFERRED: 2 },
  GRID_TYPES: { GRIDLESS: 0, SQUARE: 1, HEXODDR: 2, HEXEVENR: 3, HEXODDQ: 4, HEXEVENQ: 5 },
  TOKEN_DISPLAY_MODES: { NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50 },
  TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
  TOKEN_SHAPES: { ELLIPSE_1: 0, ELLIPSE_2: 1, TRAPEZOID_1: 2, TRAPEZOID_2: 3, RECTANGLE_1: 4, RECTANGLE_2: 5 },
  WALL_SENSE_TYPES: { NONE: 0, LIMITED: 10, NORMAL: 20, PROXIMITY: 30, DISTANCE: 40 },
  WALL_MOVEMENT_TYPES: { NONE: 0, NORMAL: 20 },
  WALL_DIRECTIONS: { BOTH: 0, LEFT: 1, RIGHT: 2 },
  WALL_DOOR_TYPES: { NONE: 0, DOOR: 1, SECRET: 2 },
  WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 },
  DRAWING_TYPES: { RECTANGLE: "r", ELLIPSE: "e", TEXT: "t", POLYGON: "p" },
  DRAWING_FILL_TYPES: { NONE: 0, SOLID: 1, PATTERN: 2 },
  MEASURED_TEMPLATE_TYPES: { CIRCLE: "circle", CONE: "cone", RECTANGLE: "rect", RAY: "ray" },
  LIGHTING_LEVELS: { UNLIT: -2, DIM: 0, BRIGHT: 1 },
  PACKAGE_TYPES: ["world", "system", "module"],
  SETTING_SCOPES: { CLIENT: "client", WORLD: "world", USER: "user" },
  FILE_CATEGORIES: {
    IMAGE: { apng: "image/apng", avif: "image/avif", bmp: "image/bmp", gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", webp: "image/webp" },
    AUDIO: { flac: "audio/flac", m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/opus", wav: "audio/wav", webm: "audio/webm" },
    VIDEO: { m4v: "video/mp4", mp4: "video/mp4", ogv: "video/ogg", webm: "video/webm" },
  },
});
