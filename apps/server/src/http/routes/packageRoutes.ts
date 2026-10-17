import { Router } from "express";
import { createRateLimiter } from "../../security/rateLimiter";
import { installPackageRequestSchema, setWorldSystemRequestSchema } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import { toPackageRecord } from "../../packages/PackageRegistry";
import type { ServerContext } from "../../ServerContext";
import { parseRequestBody, requireGameMaster, requireActiveWorld } from "../requestGuards";
import { readActiveModuleIds } from "../../world/moduleConfiguration";

export function createPackageRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireGameMaster(context));

  const installRateLimiter = createRateLimiter({ windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

  router.get("/modules", (_request, response) => {
    const activeModuleIds = readActiveModuleIds(requireActiveWorld(context));
    response.json(context.packageRegistry.listModules().map((installed) => toPackageRecord(installed, activeModuleIds.has(installed.id))));
  });

  router.get("/systems", (_request, response) => {
    const activeSystemId = requireActiveWorld(context).manifest.system;
    response.json(context.packageRegistry.listSystems().map((installed) => toPackageRecord(installed, installed.id === activeSystemId)));
  });

  router.post("/world-system", installRateLimiter, async (request, response) => {
    const { systemId } = parseRequestBody(setWorldSystemRequestSchema, request);
    if (systemId !== null && !context.packageRegistry.find("system", systemId)) throw HttpError.notFound("Sistema não instalado");
    const world = await context.activeWorld.changeSystem(systemId);
    context.logger.info("Sistema do mundo alterado", { world: world.manifest.id, system: systemId ?? "nenhum" });
    response.json({ system: world.manifest.system });
  });

  router.post("/install", installRateLimiter, async (request, response) => {
    const installRequest = parseRequestBody(installPackageRequestSchema, request);
    const installed = await context.packageInstaller.install(installRequest.manifestUrl, installRequest.packageType);
    response.status(201).json({ id: installed.id, title: installed.title, version: installed.version });
  });

  return router;
}
