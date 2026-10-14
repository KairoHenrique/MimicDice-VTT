import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { HttpError } from "../errors/HttpError";
import { readSessionToken } from "../security/cookies";
import type { Session } from "../security/SessionStore";
import type { ServerContext } from "../ServerContext";
import type { ActiveWorld } from "../world/ActiveWorld";

export interface AuthenticatedRequestState {
  session: Session;
  world: ActiveWorld;
}

declare module "express-serve-static-core" {
  interface Locals {
    auth?: AuthenticatedRequestState;
  }
}

export function parseRequestBody<TSchema extends z.ZodTypeAny>(schema: TSchema, request: Request): z.infer<TSchema> {
  if (!request.is("application/json")) throw HttpError.badRequest("Conteúdo precisa ser JSON");
  const result = schema.safeParse(request.body);
  if (!result.success) throw HttpError.badRequest();
  return result.data;
}

export function requireActiveWorld(context: ServerContext): ActiveWorld {
  const world = context.activeWorld.current;
  if (!world) throw HttpError.conflict("Nenhum mundo configurado");
  return world;
}

export function requireSession(context: ServerContext) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const world = requireActiveWorld(context);
    const session = context.sessions.resolve(readSessionToken(request.headers.cookie));
    if (!session || !world.users.getUser(session.userId)) throw HttpError.unauthorized();
    response.locals.auth = { session, world };
    next();
  };
}

export function requireGameMaster(context: ServerContext) {
  const sessionGuard = requireSession(context);
  return (request: Request, response: Response, next: NextFunction): void => {
    sessionGuard(request, response, () => {
      const { session, world } = response.locals.auth as AuthenticatedRequestState;
      if (!world.users.isGameMaster(session.userId)) throw HttpError.forbidden();
      next();
    });
  };
}

export function authenticatedState(response: Response): AuthenticatedRequestState {
  const state = response.locals.auth;
  if (!state) throw HttpError.unauthorized();
  return state;
}
