import { z } from "zod";
import { MAX_DOCUMENTS_PER_OPERATION, PACKAGE_ID_PATTERN, SETTING_KEY_PATTERN, USER_ROLES } from "./constants";

const documentIdSchema = z.string().regex(/^[A-Za-z0-9]{16}$/);

const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^<>"'`\\]+$/, "Nome contém caracteres não permitidos");

/** The Game Master picks any password; the upper bound only caps hashing cost. */
const passwordSchema = z.string().min(1).max(128);

/** An empty Game Master password means the room has no password at all. */
const optionalPasswordSchema = z.string().max(128);

export const setupRequestSchema = z.object({
  worldTitle: z.string().trim().min(1).max(80),
  gameMasterName: displayNameSchema,
  gameMasterPassword: optionalPasswordSchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: optionalPasswordSchema,
  newPassword: optionalPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const banIdParamSchema = documentIdSchema;

export const joinRequestSchema = z.object({
  userId: documentIdSchema,
  password: optionalPasswordSchema,
  /** Keeps this browser signed in for the Game Master without storing the password anywhere. */
  remember: z.boolean().optional(),
});

export const rememberedJoinResponseSchema = z.object({ userId: documentIdSchema.nullable() });
export type RememberedJoinResponse = z.infer<typeof rememberedJoinResponseSchema>;
export type JoinRequest = z.infer<typeof joinRequestSchema>;

/** Players join by name alone; only Game Master accounts are password-protected. */
export const playerJoinRequestSchema = z.object({ name: displayNameSchema });
export type PlayerJoinRequest = z.infer<typeof playerJoinRequestSchema>;

export const MAX_PLAYERS_PER_WORLD = 40;

const worldTitleSchema = z.string().trim().min(1).max(80).regex(/^[^<>"'`\\]+$/, "Nome contém caracteres não permitidos");

export const createWorldRequestSchema = z.object({ title: worldTitleSchema });
export type CreateWorldRequest = z.infer<typeof createWorldRequestSchema>;

export const activateWorldRequestSchema = z.object({ worldId: z.string().regex(/^[a-z0-9-]{1,64}$/) });
export type ActivateWorldRequest = z.infer<typeof activateWorldRequestSchema>;

/** Deleting or renaming a room asks for that room's Game Master password. */
export const deleteWorldRequestSchema = activateWorldRequestSchema.extend({ password: optionalPasswordSchema });
export type DeleteWorldRequest = z.infer<typeof deleteWorldRequestSchema>;

export const renameWorldRequestSchema = deleteWorldRequestSchema.extend({ title: worldTitleSchema });
export type RenameWorldRequest = z.infer<typeof renameWorldRequestSchema>;

/** The table only distinguishes players from Game Masters; intermediate roles are not offered. */
const assignableRoleSchema = z.union([z.literal(USER_ROLES.PLAYER), z.literal(USER_ROLES.GAMEMASTER)]);

export const createUserRequestSchema = z.object({
  name: displayNameSchema,
  password: passwordSchema,
  role: assignableRoleSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/** Promoting someone to Game Master requires giving them a password, since GM accounts never join by name. */
export const changeUserRoleRequestSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal(USER_ROLES.PLAYER) }),
  z.object({ role: z.literal(USER_ROLES.GAMEMASTER), password: passwordSchema }),
]);
export type ChangeUserRoleRequest = z.infer<typeof changeUserRoleRequestSchema>;

export const userIdParamSchema = documentIdSchema;

const COORDINATE_LIMIT = 1_000_000;
export const sceneViewSchema = z.object({
  x: z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT),
  y: z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT),
  scale: z.number().finite().min(0.1).max(3),
});
export type SceneView = z.infer<typeof sceneViewSchema>;

/** A highlighted point on a scene; `pull` (GM only) also moves everyone's camera there. */
export const canvasPingRequestSchema = z.object({
  sceneId: documentIdSchema,
  x: z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT),
  y: z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT),
  pull: z.boolean().optional(),
});
export type CanvasPingRequest = z.infer<typeof canvasPingRequestSchema>;

export const canvasPingBroadcastSchema = canvasPingRequestSchema.extend({ userId: documentIdSchema });
export type CanvasPingBroadcast = z.infer<typeof canvasPingBroadcastSchema>;

/** Live position of tokens while their owner drags them; `ended` tells others to drop the preview. Nothing is saved. */
export const MAX_DRAGGED_TOKENS = 20;
export const tokenDragRequestSchema = z.object({
  sceneId: documentIdSchema,
  tokens: z
    .array(
      z.object({
        tokenId: documentIdSchema,
        x: z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT),
        y: z.number().finite().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT),
      }),
    )
    .min(1)
    .max(MAX_DRAGGED_TOKENS),
  ended: z.boolean().optional(),
});
export type TokenDragRequest = z.infer<typeof tokenDragRequestSchema>;
export const tokenDragBroadcastSchema = tokenDragRequestSchema.extend({ userId: documentIdSchema });
export type TokenDragBroadcast = z.infer<typeof tokenDragBroadcastSchema>;

/** With `view`, players also get the GM's exact camera position and zoom. */
export const MAX_PULLED_USERS = 50;

/** Without `userIds` every connected player is pulled; with it, only those users. */
export const pullToSceneRequestSchema = z.object({
  sceneId: documentIdSchema,
  view: sceneViewSchema.optional(),
  userIds: z.array(documentIdSchema).min(1).max(MAX_PULLED_USERS).optional(),
});
export type PullToSceneRequest = z.infer<typeof pullToSceneRequestSchema>;

export const installPackageRequestSchema = z.object({
  manifestUrl: z.string().trim().url().max(2048),
  packageType: z.enum(["module", "system"]).default("module"),
});
export type InstallPackageRequest = z.infer<typeof installPackageRequestSchema>;

export const setWorldSystemRequestSchema = z.object({
  systemId: z.string().regex(PACKAGE_ID_PATTERN).nullable(),
});
export type SetWorldSystemRequest = z.infer<typeof setWorldSystemRequestSchema>;

export const modifySettingRequestSchema = z.object({
  key: z.string().regex(SETTING_KEY_PATTERN),
  scope: z.enum(["world", "user"]),
  value: z.string(),
});
export type ModifySettingRequest = z.infer<typeof modifySettingRequestSchema>;

const filePathSchema = z.string().max(512);

export const browseFilesQuerySchema = z.object({
  target: filePathSchema.default(""),
  extensions: z.string().max(400).optional(),
});
export type BrowseFilesQuery = z.infer<typeof browseFilesQuerySchema>;

export const uploadFileQuerySchema = z.object({
  target: filePathSchema,
  name: z.string().trim().min(1).max(160),
});
export type UploadFileQuery = z.infer<typeof uploadFileQuerySchema>;

export const createDirectoryRequestSchema = z.object({ target: filePathSchema.min(1) });
export type CreateDirectoryRequest = z.infer<typeof createDirectoryRequestSchema>;

/** Paths under uploads the user may erase (files or folders). */
export const MAX_DELETE_PATHS = 100;
export const deleteFilesRequestSchema = z.object({
  paths: z.array(filePathSchema.min(1)).min(1).max(MAX_DELETE_PATHS),
});
export type DeleteFilesRequest = z.infer<typeof deleteFilesRequestSchema>;

export interface FileDeleteResult {
  deleted: string[];
}

export interface FileBrowseResult {
  target: string;
  dirs: string[];
  files: string[];
  writable: boolean;
  /** Where "Voltar" goes; null hides it. Absent means the plain parent folder. */
  parent?: string | null;
  /** Friendly names for folders whose path is an id (a player's folder). */
  labels?: Record<string, string>;
  /** The user's own folders here that they may share with the group, and whether each one is shared. */
  shareable?: Record<string, boolean>;
}

export const shareFolderRequestSchema = z.object({ target: filePathSchema.min(1), shared: z.boolean() });
export type ShareFolderRequest = z.infer<typeof shareFolderRequestSchema>;

/** Plain-text notes kept in the uploads folders (`.md` or `.txt`). */
export const MAX_NOTE_FILE_CHARACTERS = 200_000;
export const readNoteFileQuerySchema = z.object({ path: filePathSchema.min(1) });
export type ReadNoteFileQuery = z.infer<typeof readNoteFileQuerySchema>;
export const writeNoteFileRequestSchema = z.object({ path: filePathSchema.min(1), content: z.string().max(MAX_NOTE_FILE_CHARACTERS) });
export type WriteNoteFileRequest = z.infer<typeof writeNoteFileRequestSchema>;

export interface NoteFileResult {
  path: string;
  content: string;
  writable: boolean;
}

export interface FileUploadResult {
  path: string;
}

export const MAX_RPG_TEXT_FILE_CHARACTERS = 1_000_000;
const rpgRelativePathSchema = z.string().max(1024);
const rpgEntryPathSchema = rpgRelativePathSchema.min(1);
const rpgEntryNameSchema = z.string().trim().min(1).max(200);

export const rpgFolderQuerySchema = z.object({ path: rpgRelativePathSchema.default("") });
export const rpgFileQuerySchema = z.object({ path: rpgEntryPathSchema, download: z.enum(["0", "1"]).optional() });
export const rpgUploadQuerySchema = z.object({ path: rpgRelativePathSchema.default(""), name: rpgEntryNameSchema });
export const rpgCreateFolderRequestSchema = z.object({ path: rpgRelativePathSchema.default(""), name: rpgEntryNameSchema });
export const rpgRenameRequestSchema = z.object({ path: rpgEntryPathSchema, newName: rpgEntryNameSchema });
export const rpgMoveRequestSchema = z.object({ path: rpgEntryPathSchema, destination: rpgRelativePathSchema });
export const rpgEntryRequestSchema = z.object({ path: rpgEntryPathSchema });
export const rpgCopyRequestSchema = z.object({ path: rpgEntryPathSchema, destination: rpgRelativePathSchema });
/** Several entries to erase in one go (Arquivos do Mestre). */
export const MAX_RPG_DELETE_PATHS = 100;
export const rpgDeleteManyRequestSchema = z.object({
  paths: z.array(rpgEntryPathSchema).min(1).max(MAX_RPG_DELETE_PATHS),
});
export const rpgWriteTextRequestSchema = z.object({ path: rpgEntryPathSchema, content: z.string().max(MAX_RPG_TEXT_FILE_CHARACTERS) });

export interface RpgEntry {
  name: string;
  path: string;
  kind: "folder" | "file";
  size: number;
  modified: number;
}

export interface RpgFolderListing {
  worldTitle: string;
  rootName: string;
  path: string;
  entries: RpgEntry[];
}

export interface RpgFolderTreeNode {
  path: string;
  name: string;
  children: RpgFolderTreeNode[];
}

const documentPayloadSchema = z.record(z.string().max(200), z.unknown());

const operationOptionKeysToStrip = ["data", "updates", "ids", "parentUuid", "modifiedTime", "render"] as const;

export const modifyDocumentRequestSchema = z.object({
  type: z.string().regex(/^[A-Z][A-Za-z]{1,40}$/),
  action: z.enum(["create", "update", "delete"]),
  operation: z
    .object({
      data: z.array(documentPayloadSchema).max(MAX_DOCUMENTS_PER_OPERATION).optional(),
      updates: z.array(documentPayloadSchema).max(MAX_DOCUMENTS_PER_OPERATION).optional(),
      ids: z.array(documentIdSchema).max(MAX_DOCUMENTS_PER_OPERATION).optional(),
      parentUuid: z.string().max(200).nullable().optional(),
      keepId: z.boolean().optional(),
      keepEmbeddedIds: z.boolean().optional(),
      diff: z.boolean().optional(),
      recursive: z.boolean().optional(),
      deleteAll: z.boolean().optional(),
    })
    .catchall(z.unknown()),
});
export type ModifyDocumentRequest = z.infer<typeof modifyDocumentRequestSchema>;

/** Operation options other than the payload itself, relayed to other clients so their hooks receive them. */
export function extractOperationOptions(operation: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(operation)) {
    if ((operationOptionKeysToStrip as readonly string[]).includes(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) options[key] = value;
  }
  return options;
}
