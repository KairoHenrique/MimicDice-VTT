import { z } from "zod";
import { MAX_DOCUMENTS_PER_OPERATION, PACKAGE_ID_PATTERN, SETTING_KEY_PATTERN, USER_ROLES } from "./constants";

const documentIdSchema = z.string().regex(/^[A-Za-z0-9]{16}$/);

const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[^<>"'`\\]+$/, "Nome contém caracteres não permitidos");

const passwordSchema = z.string().min(8).max(128);

export const setupRequestSchema = z.object({
  worldTitle: z.string().trim().min(1).max(80),
  gameMasterName: displayNameSchema,
  gameMasterPassword: passwordSchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

export const joinRequestSchema = z.object({
  userId: documentIdSchema,
  password: z.string().min(1).max(128),
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

/** Players join by name alone; only Game Master accounts are password-protected. */
export const playerJoinRequestSchema = z.object({ name: displayNameSchema });
export type PlayerJoinRequest = z.infer<typeof playerJoinRequestSchema>;

export const MAX_PLAYERS_PER_WORLD = 40;

export const createWorldRequestSchema = z.object({
  title: z.string().trim().min(1).max(80).regex(/^[^<>"'`\\]+$/, "Nome contém caracteres não permitidos"),
});
export type CreateWorldRequest = z.infer<typeof createWorldRequestSchema>;

export const activateWorldRequestSchema = z.object({ worldId: z.string().regex(/^[a-z0-9-]{1,64}$/) });
export type ActivateWorldRequest = z.infer<typeof activateWorldRequestSchema>;

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

export const pullToSceneRequestSchema = z.object({ sceneId: documentIdSchema });
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

export interface FileBrowseResult {
  target: string;
  dirs: string[];
  files: string[];
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
