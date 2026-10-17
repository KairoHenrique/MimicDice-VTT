import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  canvasPingRequestSchema,
  MAX_PACKAGE_EVENT_BYTES,
  MAX_PINGS_PER_WINDOW,
  modifySettingRequestSchema,
  PING_WINDOW_MS,
  pullToSceneRequestSchema,
  sheetPingRequestSchema,
  SOCKET_EVENTS,
  TABLE_SESSION_IDLE_CLOSE_MS,
  TABLE_SESSION_OPEN_SETTING_KEY,
} from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { readSessionToken } from "../security/cookies";
import { clientAddressOf } from "../security/clientAddress";
import { maskAddress } from "../security/networkAddress";
import type { ServerContext } from "../ServerContext";
import { buildWorldSnapshot } from "./buildWorldSnapshot";
import { registerDocumentHandlers } from "./documentHandlers";
import { attachPackageEventRelay } from "./packageEventRelay";
import { PresenceTracker } from "./PresenceTracker";
import { SlidingWindowLimiter } from "./SlidingWindowLimiter";
import { attachTokenDragRelay } from "./tokenDragRelay";
import { attachItemExchangeHandler } from "./itemExchangeHandler";
import { attachChestHandler } from "./chestHandler";
import { attachLootPickupHandler } from "./lootPickupHandler";
import { TableSessionIdleCloser } from "../world/TableSessionIdleCloser";

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

function registerCoreHandlers(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker, pingLimiter: SlidingWindowLimiter): void {
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

  registerPingHandler(context, socket, userId, pingLimiter);
  registerSheetPingHandler(context, socket, userId);
}

/** Pings are relayed to everyone else on the server; only a GM ping may move other players' cameras. */
function registerPingHandler(context: ServerContext, socket: Socket, userId: string, pingLimiter: SlidingWindowLimiter): void {
  socket.on(SOCKET_EVENTS.CANVAS_PING, (payload: unknown) => {
    const world = context.activeWorld.current;
    const parsed = canvasPingRequestSchema.safeParse(payload);
    if (!world || !parsed.success || !pingLimiter.tryConsume(userId)) return;
    if (!world.users.isGameMaster(userId) && !isTableSessionOpen(context)) return;
    const sceneExists = world.documents.listCollection("scenes").some((scene) => scene._id === parsed.data.sceneId);
    if (!sceneExists) return;
    const pull = parsed.data.pull === true && world.users.isGameMaster(userId);
    socket.broadcast.emit(SOCKET_EVENTS.CANVAS_PING, { sceneId: parsed.data.sceneId, x: parsed.data.x, y: parsed.data.y, pull, userId });
  });
}

/** GM pings specific sections or elements on an actor's sheet to guide beginner players. */
function registerSheetPingHandler(context: ServerContext, socket: Socket, userId: string): void {
  socket.on(SOCKET_EVENTS.SHEET_PING, (payload: unknown) => {
    const world = context.activeWorld.current;
    const parsed = sheetPingRequestSchema.safeParse(payload);
    if (!world || !parsed.success) return;
    if (!world.users.isGameMaster(userId)) return;
    const actorExists = world.documents.listCollection("actors").some((actor) => actor._id === parsed.data.actorId);
    if (!actorExists) return;
    socket.broadcast.emit(SOCKET_EVENTS.SHEET_PING, { ...parsed.data, userId });
  });
}

/** The public record rides along so clients that booted before a player first joined can add that player. */
function trackPresence(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker, onLastDisconnect: (userId: string) => void): void {
  const { userId } = identityOf(socket);
  void socket.join(`user:${userId}`);
  if (presence.registerConnection(userId)) {
    const user = context.activeWorld.current?.users.listPublicUsers().find((record) => record._id === userId);
    io.emit(SOCKET_EVENTS.USER_ACTIVITY, { userId, active: true, user });
  }
  socket.on("disconnect", () => {
    if (!presence.releaseConnection(userId)) return;
    io.emit(SOCKET_EVENTS.USER_ACTIVITY, { userId, active: false });
    onLastDisconnect(userId);
  });
}

function isTableSessionOpen(context: ServerContext): boolean {
  return context.activeWorld.current?.settings.readWorldValue<boolean>(TABLE_SESSION_OPEN_SETTING_KEY) === true;
}

/** Every inbound message (including the clients' input heartbeat) counts as activity at the table. */
function createIdleCloser(context: ServerContext, io: Server): TableSessionIdleCloser {
  return new TableSessionIdleCloser({
    idleLimitMs: TABLE_SESSION_IDLE_CLOSE_MS,
    isSessionOpen: () => isTableSessionOpen(context),
    closeSession: async () => {
      const world = context.activeWorld.current;
      if (!world) return;
      const setting = await world.settings.applyModification({ scope: "world", key: TABLE_SESSION_OPEN_SETTING_KEY, value: "false" }, { userId: "server", isGameMaster: true });
      io.emit(SOCKET_EVENTS.SETTING_UPDATED, setting);
      context.logger.info("Sessão da mesa fechada por inatividade");
    },
    onError: (error) => context.logger.error("Falha ao fechar a sessão por inatividade", error),
  });
}

export function createSocketServer(context: ServerContext, httpServer: HttpServer): Server {
  const presence = new PresenceTracker();
  const pingLimiter = new SlidingWindowLimiter(MAX_PINGS_PER_WINDOW, PING_WINDOW_MS);
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
      context.logger.warn("Conexão em tempo real recusada", { remote: maskAddress(clientAddressOf(socket.request)) });
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

  const idleCloser = createIdleCloser(context, io);
  idleCloser.start();

  io.on("connection", (socket) => {
    socket.use((_packet, next) => {
      idleCloser.recordActivity();
      next();
    });
    trackPresence(context, io, socket, presence, (userId) => pingLimiter.forget(userId));
    registerCoreHandlers(context, io, socket, presence, pingLimiter);
    registerDocumentHandlers(context, io, socket, presence, identityOf(socket).userId);
    attachPackageEventRelay(context, socket);
    attachTokenDragRelay(context, io, socket, identityOf(socket).userId);
    attachLootPickupHandler(context, io, socket, presence, identityOf(socket).userId);
    attachItemExchangeHandler(context, io, socket, presence, identityOf(socket).userId);
    attachChestHandler(context, io, socket, presence, identityOf(socket).userId);
  });

  return io;
}
