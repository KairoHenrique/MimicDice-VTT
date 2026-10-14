import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  joinRequestSchema,
  playerJoinRequestSchema,
  setupRequestSchema,
  USER_ROLES,
  type ServerStatusResponse,
  type SessionResponse,
} from "@tabbletop/protocol";
import { HttpError } from "../../errors/HttpError";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "../../security/cookies";
import { isLoopbackAddress, maskAddress } from "../../security/networkAddress";
import type { ServerContext } from "../../ServerContext";
import { authenticatedState, parseRequestBody, requireActiveWorld, requireSession } from "../requestGuards";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function createCredentialRateLimiter() {
  return rateLimit({
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
  const playerJoinRateLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES_MS, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Tentativas demais. Aguarde alguns minutos." } });

  router.get("/status", (request, response) => {
    const world = context.activeWorld.current;
    const status: ServerStatusResponse = {
      configured: world !== undefined && world.users.userCount > 0,
      world: world ? { id: world.manifest.id, title: world.manifest.title } : null,
      isLocalRequest: isLoopbackAddress(request.socket.remoteAddress),
    };
    response.json(status);
  });

  let setupInProgress = false;
  router.post("/setup", credentialRateLimiter, async (request, response) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) throw HttpError.forbidden("A configuração só pode ser feita no PC que hospeda");
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
      context.logger.warn("Login recusado", { remote: maskAddress(request.socket.remoteAddress) });
      throw HttpError.unauthorized("Usuário ou senha incorretos");
    }
    const session = context.sessions.create(user._id);
    writeSessionCookie(response, session.token, context.config.sessionLifetimeMs);
    response.json({ userId: user._id } satisfies SessionResponse);
  });

  router.post("/join/player", playerJoinRateLimiter, async (request, response) => {
    const world = requireActiveWorld(context);
    const { name } = parseRequestBody(playerJoinRequestSchema, request);
    const user = await world.users.joinPlayerByName(name);
    const session = context.sessions.create(user._id);
    writeSessionCookie(response, session.token, context.config.sessionLifetimeMs);
    context.logger.info("Jogador entrou pelo nome", { userId: user._id, remote: maskAddress(request.socket.remoteAddress) });
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
