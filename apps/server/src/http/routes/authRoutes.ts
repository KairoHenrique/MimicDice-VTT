import { Router } from "express";
import {
  joinRequestSchema,
  playerJoinRequestSchema,
  setupRequestSchema,
  USER_ROLES,
  type RememberedJoinResponse,
  type ServerStatusResponse,
  type SessionResponse,
} from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import { clearRememberCookie, clearSessionCookie, readRememberToken, readSessionToken, writeRememberCookie, writeSessionCookie } from "../../security/cookies";
import { clientAddressOf, isHostMachineRequest } from "../../security/clientAddress";
import { maskAddress } from "../../security/networkAddress";
import { createRateLimiter } from "../../security/rateLimiter";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireActiveWorld, requireSession } from "../requestGuards";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function createCredentialRateLimiter() {
  return createRateLimiter({
    windowMs: FIFTEEN_MINUTES_MS,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Tentativas demais. Aguarde alguns minutos." },
  });
}

export function createAuthRoutes(context: ServerContext): Router {
  const router = Router();
  const credentialRateLimiter = createCredentialRateLimiter();
  const playerJoinRateLimiter = createRateLimiter({ windowMs: FIFTEEN_MINUTES_MS, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Tentativas demais. Aguarde alguns minutos." } });

  router.get("/status", (request, response) => {
    const world = context.activeWorld.current;
    const status: ServerStatusResponse = {
      configured: world !== undefined && world.users.userCount > 0,
      world: world ? { id: world.manifest.id, title: world.manifest.title } : null,
      isLocalRequest: isHostMachineRequest(request),
    };
    response.json(status);
  });

  let setupInProgress = false;
  router.post("/setup", credentialRateLimiter, async (request, response) => {
    if (!isHostMachineRequest(request)) throw HttpError.forbidden("A configuração só pode ser feita no PC que hospeda");
    const existingWorld = context.activeWorld.current;
    if (setupInProgress || (existingWorld && existingWorld.users.userCount > 0)) throw HttpError.conflict("O mundo já foi configurado");

    const setupRequest = parseRequestBody(setupRequestSchema, request);
    setupInProgress = true;
    try {
      const world = existingWorld ?? (await context.activeWorld.activate((await context.worlds.createWorld(setupRequest.worldTitle)).id));
      const gameMaster = await world.users.createUser({
        name: setupRequest.gameMasterName,
        password: setupRequest.gameMasterPassword,
        role: USER_ROLES.GAMEMASTER,
      });

      const session = context.sessions.create(gameMaster._id);
      writeSessionCookie(response, session.token, context.config.sessionLifetimeMs);
      context.logger.info("Mundo configurado", { worldId: world.manifest.id });
      response.status(201).json({ userId: gameMaster._id } satisfies SessionResponse);
    } finally {
      setupInProgress = false;
    }
  });

  router.get("/join/users", (_request, response) => {
    const world = requireActiveWorld(context);
    const actorNames = new Map(world.documents.listCollection("actors").map((actor) => [actor._id, typeof actor.name === "string" ? actor.name : null]));
    response.json(world.users.listJoinableUsers((actorId) => actorNames.get(actorId) ?? null));
  });

  router.post("/join", credentialRateLimiter, async (request, response) => {
    const world = requireActiveWorld(context);
    const joinRequest = parseRequestBody(joinRequestSchema, request);
    const user = await world.users.verifyCredentials(joinRequest.userId, joinRequest.password);
    if (!user) {
      context.logger.warn("Login recusado", { remote: maskAddress(clientAddressOf(request)) });
      throw HttpError.unauthorized("Usuário ou senha incorretos");
    }
    const session = context.sessions.create(user._id, context.deviceFingerprints.keyFor(clientAddressOf(request)));
    writeSessionCookie(response, session.token, context.config.sessionLifetimeMs);
    if (joinRequest.remember) {
      const device = await context.rememberedDevices.remember(user._id, world.manifest.id);
      writeRememberCookie(response, device.token, context.rememberedDevices.lifetimeMs);
    }
    response.json({ userId: user._id } satisfies SessionResponse);
  });

  router.get("/join/remembered", (request, response) => {
    const world = requireActiveWorld(context);
    const userId = context.rememberedDevices.peek(readRememberToken(request.headers.cookie), world.manifest.id);
    response.json({ userId: userId && world.users.isGameMaster(userId) ? userId : null } satisfies RememberedJoinResponse);
  });

  router.post("/join/remembered", credentialRateLimiter, async (request, response) => {
    const world = requireActiveWorld(context);
    const rotated = await context.rememberedDevices.rotate(readRememberToken(request.headers.cookie), world.manifest.id);
    if (!rotated || !world.users.isGameMaster(rotated.userId)) {
      if (rotated) await context.rememberedDevices.forgetUser(rotated.userId);
      clearRememberCookie(response);
      throw HttpError.unauthorized("A senha lembrada expirou. Digite a senha de novo.");
    }
    const session = context.sessions.create(rotated.userId);
    writeSessionCookie(response, session.token, context.config.sessionLifetimeMs);
    writeRememberCookie(response, rotated.device.token, context.rememberedDevices.lifetimeMs);
    response.json({ userId: rotated.userId } satisfies SessionResponse);
  });

  router.post("/join/forget", async (request, response) => {
    await context.rememberedDevices.forget(readRememberToken(request.headers.cookie));
    clearRememberCookie(response);
    response.status(204).end();
  });

  router.post("/join/player", playerJoinRateLimiter, async (request, response) => {
    const world = requireActiveWorld(context);
    const { name } = parseRequestBody(playerJoinRequestSchema, request);
    const deviceKey = context.deviceFingerprints.keyFor(clientAddressOf(request));
    if (world.bans.isBanned(name, deviceKey)) {
      context.logger.warn("Entrada recusada: jogador banido", { remote: maskAddress(clientAddressOf(request)) });
      throw HttpError.forbidden("Você foi banido desta mesa pelo mestre.");
    }
    const user = await world.users.joinPlayerByName(name);
    const session = context.sessions.create(user._id, deviceKey);
    writeSessionCookie(response, session.token, context.config.sessionLifetimeMs);
    context.logger.info("Jogador entrou pelo nome", { userId: user._id, remote: maskAddress(clientAddressOf(request)) });
    response.json({ userId: user._id } satisfies SessionResponse);
  });

  router.get("/session", requireSession(context), (_request, response) => {
    response.json({ userId: authenticatedState(response).session.userId } satisfies SessionResponse);
  });

  router.post("/logout", (request, response) => {
    const token = readSessionToken(request.headers.cookie);
    if (token) context.sessions.revoke(token);
    clearSessionCookie(response);
    response.status(204).end();
  });

  return router;
}
