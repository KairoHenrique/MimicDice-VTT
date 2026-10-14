import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { activateWorldRequestSchema, createWorldRequestSchema, type WorldSummaryRecord } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireGameMaster } from "../requestGuards";

/** Game Master only: list the tables (worlds) on this PC, open another one or start a new one. */
export function createWorldRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireGameMaster(context));
  const switchLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Aguarde um pouco antes de trocar de sala de novo." } });

  const currentGameMaster = (response: Parameters<typeof authenticatedState>[0]) => {
    const { session, world } = authenticatedState(response);
    const user = world.users.getUser(session.userId);
    if (!user) throw HttpError.unauthorized();
    return user;
  };

  router.get("/", async (_request, response) => {
    const activeId = context.activeWorld.current?.manifest.id;
    const worlds = await context.activeWorld.listWorlds();
    response.json(worlds.map(({ id, title, created }) => ({ id, title, created, active: id === activeId })) satisfies WorldSummaryRecord[]);
  });

  router.post("/", switchLimiter, async (request, response) => {
    const { title } = parseRequestBody(createWorldRequestSchema, request);
    const gameMaster = currentGameMaster(response);
    const world = await context.activeWorld.createAndSwitch(title, gameMaster).catch((error: unknown) => {
      context.logger.error("Falha ao criar sala", error);
      throw HttpError.conflict("Não foi possível criar a sala agora.");
    });
    context.logger.info("Sala criada e aberta", { worldId: world.manifest.id });
    response.status(201).json({ id: world.manifest.id });
  });

  router.post("/activate", switchLimiter, async (request, response) => {
    const { worldId } = parseRequestBody(activateWorldRequestSchema, request);
    if (worldId === context.activeWorld.current?.manifest.id) return response.json({ id: worldId });
    const gameMaster = currentGameMaster(response);
    if (!(await context.worlds.worldExists(worldId))) throw HttpError.notFound("Sala não encontrada");
    await context.activeWorld.switchTo(worldId, gameMaster).catch((error: unknown) => {
      context.logger.error("Falha ao trocar de sala", error);
      throw HttpError.conflict("Não foi possível abrir a sala agora.");
    });
    context.logger.info("Sala aberta", { worldId });
    response.json({ id: worldId });
  });

  return router;
}
