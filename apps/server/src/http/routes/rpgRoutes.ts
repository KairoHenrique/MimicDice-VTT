import path from "node:path";
import express, { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import {
  rpgCreateFolderRequestSchema,
  rpgEntryRequestSchema,
  rpgFileQuerySchema,
  rpgFolderQuerySchema,
  rpgMoveRequestSchema,
  rpgRenameRequestSchema,
  rpgUploadQuerySchema,
  rpgWriteTextRequestSchema,
  type RpgFolderListing,
} from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import { RpgFileManager } from "../../files/RpgFileManager";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireGameMaster } from "../requestGuards";

const TEXT_BODY_LIMIT = "4mb";
const INLINE_PREVIEW_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg", ".mp3", ".ogg", ".wav", ".flac", ".m4a", ".mp4", ".webm", ".txt", ".md", ".json", ".csv", ".log"]);
const FILE_RESPONSE_CSP = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";

function parseQuery<T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, request: Request): T {
  const result = schema.safeParse(request.query);
  if (!result.success) throw HttpError.badRequest();
  return result.data;
}

function managerFor(response: Response): RpgFileManager {
  return new RpgFileManager(authenticatedState(response).world.rpgDirectory);
}

/** Text the GM can see and edit in the browser; anything else is streamed as a file. */
function sendManagedFile(response: Response, file: { root: string; relativePath: string; name: string }, forceDownload: boolean): Promise<void> {
  const extension = path.extname(file.name).toLowerCase();
  const inline = !forceDownload && INLINE_PREVIEW_EXTENSIONS.has(extension);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", FILE_RESPONSE_CSP);
  response.setHeader("Cache-Control", "private, no-store");
  if (inline) response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  else response.attachment(file.name);
  if ([".txt", ".md", ".json", ".csv", ".log"].includes(extension)) response.type("text/plain; charset=utf-8");
  const relativeUrlPath = file.relativePath.split(path.sep).join("/");
  return new Promise((resolve, reject) => {
    response.sendFile(relativeUrlPath, { root: file.root, dotfiles: "deny", lastModified: true }, (error) => (error && !response.headersSent ? reject(error) : resolve()));
  });
}

function registerReadRoutes(router: Router): void {
  router.get("/list", async (request, response) => {
    const { path: folderPath } = parseQuery(rpgFolderQuerySchema, request);
    const { world } = authenticatedState(response);
    const listing = await managerFor(response).list(folderPath);
    response.json({ worldTitle: world.manifest.title, rootName: path.basename(world.rpgDirectory), ...listing } satisfies RpgFolderListing);
  });
  router.get("/tree", async (_request, response) => {
    response.json(await managerFor(response).folderTree());
  });
  router.get("/file", async (request, response) => {
    const query = parseQuery(rpgFileQuerySchema, request);
    await sendManagedFile(response, await managerFor(response).resolveFile(query.path), query.download === "1");
  });
  router.get("/text", async (request, response) => {
    const { path: filePath } = parseQuery(rpgFileQuerySchema, request);
    response.setHeader("Cache-Control", "private, no-store");
    response.json({ content: await managerFor(response).readText(filePath) });
  });
}

function registerWriteRoutes(router: Router): void {
  const writeLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false });
  const jsonBody = express.json({ limit: TEXT_BODY_LIMIT });
  router.post("/upload", writeLimiter, async (request, response) => {
    const query = parseQuery(rpgUploadQuerySchema, request);
    response.status(201).json({ path: await managerFor(response).upload(query.path, query.name, request) });
  });
  router.post("/folder", writeLimiter, jsonBody, async (request, response) => {
    const body = parseRequestBody(rpgCreateFolderRequestSchema, request);
    response.status(201).json({ path: await managerFor(response).createFolder(body.path, body.name) });
  });
  router.post("/rename", writeLimiter, jsonBody, async (request, response) => {
    const body = parseRequestBody(rpgRenameRequestSchema, request);
    response.json({ path: await managerFor(response).rename(body.path, body.newName) });
  });
  router.post("/move", writeLimiter, jsonBody, async (request, response) => {
    const body = parseRequestBody(rpgMoveRequestSchema, request);
    response.json({ path: await managerFor(response).move(body.path, body.destination) });
  });
  router.post("/delete", writeLimiter, jsonBody, async (request, response) => {
    await managerFor(response).remove(parseRequestBody(rpgEntryRequestSchema, request).path);
    response.status(204).end();
  });
  router.put("/text", writeLimiter, jsonBody, async (request, response) => {
    const body = parseRequestBody(rpgWriteTextRequestSchema, request);
    await managerFor(response).writeText(body.path, body.content);
    response.status(204).end();
  });
}

/** The Game Master's private `rpgs/<world>` folder. Every route requires a Game Master session. */
export function createRpgRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireGameMaster(context));
  registerReadRoutes(router);
  registerWriteRoutes(router);
  return router;
}
