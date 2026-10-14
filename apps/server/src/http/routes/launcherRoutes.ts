import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { activateWorldRequestSchema, createWorldRequestSchema } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import type { ServerContext } from "../../ServerContext";
import { parseRequestBody } from "../requestGuards";
import { activateWorld, createSwitchLimiter, createWorld, listWorldSummaries } from "./worldRoutes";

export const LAUNCHER_TOKEN_HEADER = "x-mimicdice-launcher";
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

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
    if (!LOOPBACK_ADDRESSES.has(request.socket.remoteAddress ?? "")) throw HttpError.forbidden();
    if (!tokensMatch(token, request.headers[LAUNCHER_TOKEN_HEADER])) throw HttpError.forbidden();
    next();
  };
}

/** Room management for the desktop launcher; the current world's Game Masters follow the table they open. */
export function createLauncherRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireLauncher(context.config.launcherToken));
  const switchLimiter = createSwitchLimiter();
  const currentGameMasters = () => context.activeWorld.current?.users.listGameMasters() ?? [];

  router.get("/worlds", async (_request, response) => {
    response.json(await listWorldSummaries(context));
  });

  router.post("/worlds", switchLimiter, async (request, response) => {
    const { title } = parseRequestBody(createWorldRequestSchema, request);
    response.status(201).json({ id: await createWorld(context, title, currentGameMasters()) });
  });

  router.post("/worlds/activate", switchLimiter, async (request, response) => {
    const { worldId } = parseRequestBody(activateWorldRequestSchema, request);
    await activateWorld(context, worldId, currentGameMasters());
    response.json({ id: worldId });
  });

  return router;
}
