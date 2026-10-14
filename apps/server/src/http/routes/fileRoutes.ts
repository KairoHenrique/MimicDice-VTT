import express, { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { roleHasPermission, type ConfiguredPermissions, type UserPermissionName } from "@tabbletop/common";
import { browseFilesQuerySchema, createDirectoryRequestSchema, shareFolderRequestSchema, uploadFileQuerySchema, type FileUploadResult } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import type { FileStorage } from "../../files/FileStorage";
import { PlayerFileArea } from "../../files/PlayerFileArea";
import { PlayerFolderSharing } from "../../files/PlayerFolderSharing";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireSession } from "../requestGuards";

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_EXTENSION_FILTERS = 40;

function assertPermission(response: Response, permission: UserPermissionName): void {
  const { session, world } = authenticatedState(response);
  const role = world.users.getUser(session.userId)?.role ?? 0;
  const configured = world.settings.readWorldValue<ConfiguredPermissions>("core.permissions") ?? {};
  if (!roleHasPermission(role, permission, configured)) throw HttpError.forbidden("Sem permissão para usar arquivos");
}

function parseExtensionFilter(raw: string | undefined): ReadonlySet<string> | null {
  if (!raw) return null;
  const extensions = raw
    .split(",")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => /^\.[a-z0-9]{1,8}$/.test(extension))
    .slice(0, MAX_EXTENSION_FILTERS);
  return extensions.length > 0 ? new Set(extensions) : null;
}

function parseQuery<T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, request: Request): T {
  const result = schema.safeParse(request.query);
  if (!result.success) throw HttpError.badRequest();
  return result.data;
}

/** The GM reaches every folder; a player only their own and what the group shared. */
function requestAccess(response: Response, storage: FileStorage, sharing: PlayerFolderSharing): { isGameMaster: boolean; userId: string; area: PlayerFileArea } {
  const { session, world } = authenticatedState(response);
  const playerName = (userId: string) => world.users.getUser(userId)?.name ?? null;
  return { isGameMaster: world.users.isGameMaster(session.userId), userId: session.userId, area: new PlayerFileArea(storage, sharing, playerName) };
}

export function createFileRoutes(context: ServerContext, storage: FileStorage): Router {
  const router = Router();
  router.use(requireSession(context));
  const sharing = new PlayerFolderSharing(context.config.configPath);
  const uploadRateLimiter = rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: "draft-7", legacyHeaders: false });

  router.get("/browse", async (request, response) => {
    assertPermission(response, "FILES_BROWSE");
    const query = parseQuery(browseFilesQuerySchema, request);
    const extensions = parseExtensionFilter(query.extensions);
    const { isGameMaster, userId, area } = requestAccess(response, storage, sharing);
    response.json(isGameMaster ? await area.labelPlayerFolders(await storage.browse(query.target, extensions)) : await area.browse(userId, query.target, extensions));
  });

  router.post("/upload", uploadRateLimiter, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (request, response) => {
    assertPermission(response, "FILES_UPLOAD");
    const query = parseQuery(uploadFileQuerySchema, request);
    if (!Buffer.isBuffer(request.body)) throw HttpError.badRequest("Arquivo ausente");
    const { isGameMaster, userId, area } = requestAccess(response, storage, sharing);
    const target = isGameMaster ? query.target : area.writableTarget(userId, query.target);
    response.status(201).json({ path: await storage.upload(target, query.name, request.body) } satisfies FileUploadResult);
  });

  router.post("/directory", uploadRateLimiter, async (request, response) => {
    assertPermission(response, "FILES_UPLOAD");
    const { target } = parseRequestBody(createDirectoryRequestSchema, request);
    const { isGameMaster, userId, area } = requestAccess(response, storage, sharing);
    response.status(201).json({ path: await storage.createDirectory(isGameMaster ? target : area.newFolderTarget(userId, target)) });
  });

  router.post("/share", uploadRateLimiter, async (request, response) => {
    assertPermission(response, "FILES_UPLOAD");
    const { target, shared } = parseRequestBody(shareFolderRequestSchema, request);
    const { userId, area } = requestAccess(response, storage, sharing);
    await area.setShared(userId, target, shared);
    response.status(204).end();
  });

  return router;
}
