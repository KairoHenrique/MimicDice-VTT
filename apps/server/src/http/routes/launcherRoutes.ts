import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { activateWorldRequestSchema, createWorldRequestSchema, deleteWorldRequestSchema, renameWorldRequestSchema } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import { isHostMachineRequest } from "../../security/clientAddress";
import type { ServerContext } from "../../ServerContext";
import { parseRequestBody } from "../requestGuards";
import { activateWorld, createSwitchLimiter, createWorld, deleteWorld, listWorldSummaries, renameWorld } from "./worldRoutes";

export const LAUNCHER_TOKEN_HEADER = "x-mimicdice-launcher";

function tokensMatch(expected: string, received: unknown): boolean {
  if (typeof received !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

/** Only the desktop app that started this server, from the same PC, may use these routes. */
function requireLauncher(token: string | null) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!token) throw HttpError.notFound();
    if (!isHostMachineRequest(request)) throw HttpError.forbidden();
    if (!tokensMatch(token, request.headers[LAUNCHER_TOKEN_HEADER])) throw HttpError.forbidden();
    next();
  };
}

/** Room management for the desktop launcher; every room keeps its own Game Master password. */
export function createLauncherRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireLauncher(context.config.launcherToken));
  const switchLimiter = createSwitchLimiter();

  router.get("/worlds", async (_request, response) => {
    response.json(await listWorldSummaries(context));
  });

  router.post("/worlds", switchLimiter, async (request, response) => {
    const { title } = parseRequestBody(createWorldRequestSchema, request);
    response.status(201).json({ id: await createWorld(context, title) });
  });

  router.post("/worlds/activate", switchLimiter, async (request, response) => {
    const { worldId } = parseRequestBody(activateWorldRequestSchema, request);
    await activateWorld(context, worldId);
    response.json({ id: worldId });
  });

  router.post("/worlds/delete", switchLimiter, async (request, response) => {
    const { worldId, password } = parseRequestBody(deleteWorldRequestSchema, request);
    await deleteWorld(context, worldId, password);
    response.json({ id: worldId });
  });

  router.post("/worlds/rename", switchLimiter, async (request, response) => {
    const { worldId, title, password } = parseRequestBody(renameWorldRequestSchema, request);
    await renameWorld(context, worldId, title, password);
    response.json({ id: worldId });
  });

  return router;
}
