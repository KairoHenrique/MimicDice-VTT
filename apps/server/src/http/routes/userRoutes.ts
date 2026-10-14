import { Router } from "express";
import { changeUserRoleRequestSchema, createUserRequestSchema, userIdParamSchema } from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireGameMaster } from "../requestGuards";

export function createUserRoutes(context: ServerContext): Router {
  const router = Router();
  router.use(requireGameMaster(context));

  router.get("/", (_request, response) => {
    response.json(authenticatedState(response).world.users.listPublicUsers());
  });

  router.post("/", async (request, response) => {
    const createRequest = parseRequestBody(createUserRequestSchema, request);
    const createdUser = await authenticatedState(response).world.users.createUser(createRequest);
    response.status(201).json(createdUser);
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
