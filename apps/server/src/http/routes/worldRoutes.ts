import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { activateWorldRequestSchema, createWorldRequestSchema, type WorldSummaryRecord } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import type { ServerContext } from "../../ServerContext";
import { parseRequestBody, requireGameMaster } from "../requestGuards";

export function createSwitchLimiter() {
  return rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Aguarde um pouco antes de trocar de sala de novo." } });
}

export async function listWorldSummaries(context: ServerContext): Promise<WorldSummaryRecord[]> {
  const activeId = context.activeWorld.current?.manifest.id;
  const worlds = await context.activeWorld.listWorlds();
  return worlds.map(({ id, title, created }) => ({ id, title, created, active: id === activeId }));
}

export async function createWorld(context: ServerContext, title: string): Promise<string> {
  const world = await context.activeWorld.createAndSwitch(title).catch((error: unknown) => {
    context.logger.error("Falha ao criar sala", error);
    throw HttpError.conflict("Não foi possível criar a sala agora.");
  });
  context.logger.info("Sala criada e aberta", { worldId: world.manifest.id });
  return world.manifest.id;
}

export async function activateWorld(context: ServerContext, worldId: string): Promise<void> {
  if (worldId === context.activeWorld.current?.manifest.id) return;
  if (!(await context.worlds.worldExists(worldId))) throw HttpError.notFound("Sala não encontrada");
  await context.activeWorld.switchTo(worldId).catch((error: unknown) => {
    context.logger.error("Falha ao trocar de sala", error);
    throw HttpError.conflict("Não foi possível abrir a sala agora.");
  });
  context.logger.info("Sala aberta", { worldId });
}

export async function deleteWorld(context: ServerContext, worldId: string): Promise<void> {
  if (worldId === context.activeWorld.current?.manifest.id) throw HttpError.conflict("Abra outra sala antes de excluir esta.");
  if (!(await context.worlds.worldExists(worldId))) throw HttpError.notFound("Sala não encontrada");
  await context.activeWorld.deleteWorld(worldId).catch((error: unknown) => {
    context.logger.error("Falha ao excluir sala", error);
    throw HttpError.conflict("Não foi possível excluir a sala agora.");
  });
  context.logger.info("Sala excluída", { worldId });
}

/** Game Master only: list the tables (worlds) on this PC, open another one or start a new one. Each has its own GM password. */
export function createWorldRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireGameMaster(context));
  const switchLimiter = createSwitchLimiter();

  router.get("/", async (_request, response) => {
    response.json(await listWorldSummaries(context));
  });

  router.post("/", switchLimiter, async (request, response) => {
    const { title } = parseRequestBody(createWorldRequestSchema, request);
    response.status(201).json({ id: await createWorld(context, title) });
  });

  router.post("/activate", switchLimiter, async (request, response) => {
    const { worldId } = parseRequestBody(activateWorldRequestSchema, request);
    await activateWorld(context, worldId);
    response.json({ id: worldId });
  });

  return router;
}
