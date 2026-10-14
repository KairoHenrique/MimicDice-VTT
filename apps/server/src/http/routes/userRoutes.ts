import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { banIdParamSchema, changePasswordRequestSchema, changeUserRoleRequestSchema, createUserRequestSchema, userIdParamSchema } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireGameMaster } from "../requestGuards";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export function createUserRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireGameMaster(context));
  const passwordChangeLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES_MS, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Tentativas demais. Aguarde alguns minutos." } });

  router.get("/", (_request, response) => {
    response.json(authenticatedState(response).world.users.listPublicUsers());
  });

  router.post("/", async (request, response) => {
    const createRequest = parseRequestBody(createUserRequestSchema, request);
    const createdUser = await authenticatedState(response).world.users.createUser(createRequest);
    response.status(201).json(createdUser);
  });

  router.post("/me/password", passwordChangeLimiter, async (request, response) => {
    const { currentPassword, newPassword } = parseRequestBody(changePasswordRequestSchema, request);
    const { session, world } = authenticatedState(response);
    await world.users.changePassword(session.userId, currentPassword, newPassword);
    await context.rememberedDevices.forgetUser(session.userId);
    context.logger.info("Senha do mestre alterada", { worldId: world.manifest.id, passwordless: newPassword === "" });
    response.status(204).end();
  });

  router.get("/bans", (_request, response) => {
    response.json(authenticatedState(response).world.bans.list());
  });

  router.delete("/bans/:banId", async (request, response) => {
    const parsedBanId = banIdParamSchema.safeParse(request.params.banId);
    if (!parsedBanId.success) throw HttpError.badRequest();
    await authenticatedState(response).world.bans.unban(parsedBanId.data);
    response.status(204).end();
  });

  /** Removes the player, blocks the name and every device they were signed in from, and kicks them out right away. */
  router.post("/:userId/ban", async (request, response) => {
    const parsedUserId = userIdParamSchema.safeParse(request.params.userId);
    if (!parsedUserId.success) throw HttpError.badRequest();
    const { session, world } = authenticatedState(response);
    const target = world.users.getUser(parsedUserId.data);
    if (!target) throw HttpError.notFound("Usuário não encontrado");
    if (target._id === session.userId || world.users.isGameMaster(target._id)) throw HttpError.conflict("Mestres não podem ser banidos");

    const ban = await world.bans.ban(target.name, context.sessions.deviceKeysForUser(target._id));
    await world.users.deleteUser(target._id);
    context.sessions.revokeAllForUser(target._id);
    context.logger.info("Jogador banido", { worldId: world.manifest.id, banId: ban._id });
    response.status(201).json(ban);
  });

  router.patch("/:userId/role", async (request, response) => {
    const parsedUserId = userIdParamSchema.safeParse(request.params.userId);
    if (!parsedUserId.success) throw HttpError.badRequest();
    const changeRequest = parseRequestBody(changeUserRoleRequestSchema, request);
    const { session, world } = authenticatedState(response);
    if (parsedUserId.data === session.userId) throw HttpError.conflict("Você não pode mudar o seu próprio papel");

    const updatedUser = await world.users.changeRole(parsedUserId.data, changeRequest);
    context.sessions.revokeAllForUser(parsedUserId.data);
    response.json(updatedUser);
  });

  router.delete("/:userId", async (request, response) => {
    const parsedUserId = userIdParamSchema.safeParse(request.params.userId);
    if (!parsedUserId.success) throw HttpError.badRequest();
    const { session, world } = authenticatedState(response);
    if (parsedUserId.data === session.userId) throw HttpError.conflict("Você não pode remover a si mesmo");

    await world.users.deleteUser(parsedUserId.data);
    context.sessions.revokeAllForUser(parsedUserId.data);
    response.status(204).end();
  });

  return router;
}
