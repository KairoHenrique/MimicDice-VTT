import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { canvasPingRequestSchema, MAX_PACKAGE_EVENT_BYTES, modifySettingRequestSchema, pullToSceneRequestSchema, SOCKET_EVENTS } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { readSessionToken } from "../security/cookies";
import { maskAddress } from "../security/networkAddress";
import type { ServerContext } from "../ServerContext";
import { buildWorldSnapshot } from "./buildWorldSnapshot";
import { registerDocumentHandlers } from "./documentHandlers";
import { attachPackageEventRelay } from "./packageEventRelay";
import { PresenceTracker } from "./PresenceTracker";
import { SocketRateLimiter } from "./SocketRateLimiter";

interface SocketIdentity {
  userId: string;
  sessionToken: string;
}

type Acknowledge = (response: unknown) => void;

function isSameOriginHandshake(originHeader: string | undefined, hostHeader: string | undefined): boolean {
  if (!originHeader) return true;
  try {
    return new URL(originHeader).host === hostHeader;
  } catch {
    return false;
  }
}

function identityOf(socket: Socket): SocketIdentity {
  return socket.data as SocketIdentity;
}

function safeAcknowledge(candidate: unknown): Acknowledge {
  return typeof candidate === "function" ? (candidate as Acknowledge) : () => undefined;
}

function registerCoreHandlers(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker): void {
  const { userId } = identityOf(socket);

  socket.on(SOCKET_EVENTS.WORLD, (acknowledgeCandidate: unknown) => {
    const acknowledge = safeAcknowledge(acknowledgeCandidate);
    const world = context.activeWorld.current;
    if (!world) return acknowledge({ error: "Nenhum mundo configurado" });
    acknowledge(buildWorldSnapshot(world, context.packageRegistry, presence, userId));
  });

  socket.on(SOCKET_EVENTS.MODIFY_SETTING, async (payload: unknown, acknowledgeCandidate: unknown) => {
    const acknowledge = safeAcknowledge(acknowledgeCandidate);
    const world = context.activeWorld.current;
    const parsed = modifySettingRequestSchema.safeParse(payload);
    if (!world || !parsed.success) return acknowledge({ error: "Dados inválidos" });
    try {
      const setting = await world.settings.applyModification(parsed.data, { userId, isGameMaster: world.users.isGameMaster(userId) });
      if (setting.user === null) io.emit(SOCKET_EVENTS.SETTING_UPDATED, setting);
      else io.to(`user:${setting.user}`).emit(SOCKET_EVENTS.SETTING_UPDATED, setting);
      acknowledge({ setting });
    } catch (error) {
      if (error instanceof HttpError) return acknowledge({ error: error.publicMessage });
      context.logger.error("Falha ao gravar configuração", error);
      acknowledge({ error: "Erro interno do servidor" });
    }
  });

  socket.on(SOCKET_EVENTS.PULL_TO_SCENE, (payload: unknown, acknowledgeCandidate: unknown) => {
    const acknowledge = safeAcknowledge(acknowledgeCandidate);
    const world = context.activeWorld.current;
    const parsed = pullToSceneRequestSchema.safeParse(payload);
    if (!world || !parsed.success) return acknowledge({ error: "Dados inválidos" });
    if (!world.users.isGameMaster(userId)) return acknowledge({ error: "Somente o mestre pode puxar os jogadores" });
    const sceneExists = world.documents.listCollection("scenes").some((scene) => scene._id === parsed.data.sceneId);
    if (!sceneExists) return acknowledge({ error: "Cena não encontrada" });
    const message = { sceneId: parsed.data.sceneId, view: parsed.data.view ?? null };
    const userIds = parsed.data.userIds?.filter((targetId) => targetId !== userId && world.users.getUser(targetId));
    if (userIds) {
      if (userIds.length > 0) io.to(userIds.map((targetId) => `user:${targetId}`)).emit(SOCKET_EVENTS.PULL_TO_SCENE, message);
    } else socket.broadcast.emit(SOCKET_EVENTS.PULL_TO_SCENE, message);
    acknowledge({ ok: true });
  });

  registerPingHandler(context, socket, userId);
}

const PING_BURST = 4;
const PINGS_PER_SECOND = 1;

/** Pings are relayed to everyone else on the server; only a GM ping may move other players' cameras. */
function registerPingHandler(context: ServerContext, socket: Socket, userId: string): void {
  const rateLimiter = new SocketRateLimiter(PING_BURST, PINGS_PER_SECOND);
  socket.on(SOCKET_EVENTS.CANVAS_PING, (payload: unknown) => {
    const world = context.activeWorld.current;
    const parsed = canvasPingRequestSchema.safeParse(payload);
    if (!world || !parsed.success || !rateLimiter.tryConsume()) return;
    const sceneExists = world.documents.listCollection("scenes").some((scene) => scene._id === parsed.data.sceneId);
    if (!sceneExists) return;
    const pull = parsed.data.pull === true && world.users.isGameMaster(userId);
    socket.broadcast.emit(SOCKET_EVENTS.CANVAS_PING, { sceneId: parsed.data.sceneId, x: parsed.data.x, y: parsed.data.y, pull, userId });
  });
}

/** The public record rides along so clients that booted before a player first joined can add that player. */
function trackPresence(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker): void {
  const { userId } = identityOf(socket);
  void socket.join(`user:${userId}`);
  if (presence.registerConnection(userId)) {
    const user = context.activeWorld.current?.users.listPublicUsers().find((record) => record._id === userId);
    io.emit(SOCKET_EVENTS.USER_ACTIVITY, { userId, active: true, user });
  }
  socket.on("disconnect", () => {
    if (presence.releaseConnection(userId)) io.emit(SOCKET_EVENTS.USER_ACTIVITY, { userId, active: false });
  });
}

export function createSocketServer(context: ServerContext, httpServer: HttpServer): Server {
  const presence = new PresenceTracker();
  const io = new Server(httpServer, {
    serveClient: false,
    maxHttpBufferSize: MAX_PACKAGE_EVENT_BYTES * 2,
    allowRequest: (request, callback) => callback(null, isSameOriginHandshake(request.headers.origin, request.headers.host)),
  });

  io.use((socket, next) => {
    const world = context.activeWorld.current;
    const sessionToken = readSessionToken(socket.handshake.headers.cookie);
    const session = context.sessions.resolve(sessionToken);
    if (!world || !session || !world.users.getUser(session.userId)) {
      context.logger.warn("Conexão em tempo real recusada", { remote: maskAddress(socket.handshake.address) });
      return next(new Error("unauthorized"));
    }
    socket.data = { userId: session.userId, sessionToken: session.token } satisfies SocketIdentity;
    next();
  });

  context.sessions.onRevoked((session) => {
    for (const socket of io.sockets.sockets.values()) {
      if (identityOf(socket).sessionToken !== session.token) continue;
      socket.emit(SOCKET_EVENTS.SESSION_ENDED);
      socket.disconnect(true);
    }
  });

  context.activeWorld.onReloaded(() => io.emit(SOCKET_EVENTS.WORLD_RELOADED));

  io.on("connection", (socket) => {
    trackPresence(context, io, socket, presence);
    registerCoreHandlers(context, io, socket, presence);
    registerDocumentHandlers(context, io, socket, presence, identityOf(socket).userId);
    attachPackageEventRelay(context, socket);
  });

  return io;
}
