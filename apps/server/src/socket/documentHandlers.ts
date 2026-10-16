import type { Server, Socket } from "socket.io";
import { isGameMasterRole } from "@tabbletop/common";
import { modifyDocumentRequestSchema, SOCKET_EVENTS, type ModifyDocumentAck, type ModifyDocumentRequest, type ModifyDocumentResponse } from "@tabbletop/protocol";
import { userUpdateSchema } from "../documents/documentSchemas";
import { buildViewerResponses, redactResponseForRequester } from "../documents/visibilityFanout";
import { HttpError } from "../errors/HttpError";
import type { ServerContext } from "../ServerContext";
import type { ActiveWorld } from "../world/ActiveWorld";
import type { PresenceTracker } from "./PresenceTracker";
import { SocketRateLimiter } from "./SocketRateLimiter";
import { auditAbilityChanges } from "./abilityAudit";

const DOCUMENT_REQUEST_BURST = 80;
const DOCUMENT_REQUESTS_PER_SECOND = 40;

type Acknowledge = (response: ModifyDocumentAck) => void;

interface DocumentHandlerScope {
  context: ServerContext;
  io: Server;
  socket: Socket;
  presence: PresenceTracker;
  userId: string;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function broadcastToViewers(scope: DocumentHandlerScope, world: ActiveWorld, outcome: Parameters<typeof buildViewerResponses>[0]): void {
  for (const user of world.users.listPublicUsers()) {
    if (!scope.presence.isActive(user._id)) continue;
    const viewer = { userId: user._id, isGameMaster: isGameMasterRole(user.role) };
    for (const response of buildViewerResponses(outcome, viewer)) {
      scope.socket.to(userRoom(user._id)).emit(SOCKET_EVENTS.MODIFY_DOCUMENT, response);
    }
  }
}

/** For changes the server makes on someone's behalf: every connected user, the requester included, gets their view. */
export function broadcastToEveryViewer(io: Server, presence: PresenceTracker, world: ActiveWorld, outcome: Parameters<typeof buildViewerResponses>[0]): void {
  for (const user of world.users.listPublicUsers()) {
    if (!presence.isActive(user._id)) continue;
    const viewer = { userId: user._id, isGameMaster: isGameMasterRole(user.role) };
    for (const response of buildViewerResponses(outcome, viewer)) io.to(userRoom(user._id)).emit(SOCKET_EVENTS.MODIFY_DOCUMENT, response);
  }
}

async function modifyUser(scope: DocumentHandlerScope, world: ActiveWorld, request: ModifyDocumentRequest): Promise<ModifyDocumentResponse> {
  if (request.action !== "update") throw HttpError.forbidden("Usuários são gerenciados pelo mestre no menu Jogadores");
  const isGameMaster = world.users.isGameMaster(scope.userId);
  const results: Array<Record<string, unknown>> = [];
  for (const rawUpdate of request.operation.updates ?? []) {
    const parsed = userUpdateSchema.safeParse(rawUpdate);
    if (!parsed.success) throw HttpError.badRequest("Atualização de usuário inválida");
    if (parsed.data._id !== scope.userId && !isGameMaster) throw HttpError.forbidden();
    results.push(await world.users.updateProfile(parsed.data._id, parsed.data));
  }
  const response: ModifyDocumentResponse = { type: "User", action: "update", userId: scope.userId, operation: {}, result: results };
  scope.socket.broadcast.emit(SOCKET_EVENTS.MODIFY_DOCUMENT, response);
  return response;
}

async function handleModifyDocument(scope: DocumentHandlerScope, payload: unknown): Promise<ModifyDocumentAck> {
  const world = scope.context.activeWorld.current;
  const parsed = modifyDocumentRequestSchema.safeParse(payload);
  if (!world || !parsed.success) return { error: "Requisição de documento inválida" };
  const user = world.users.getUser(scope.userId);
  if (!user) return { error: "Sessão inválida" };
  if (parsed.data.type === "User") return { response: await modifyUser(scope, world, parsed.data) };

  const outcome = await world.documents.modify(parsed.data, { userId: scope.userId, role: user.role });
  broadcastToViewers(scope, world, outcome);
  // Audit can write a ChatMessage; never block the ack/broadcast path on that extra round-trip.
  void auditAbilityChanges(scope.io, scope.presence, world, outcome, { userId: scope.userId, role: user.role }).catch((error: unknown) =>
    scope.context.logger.error("Falha ao registrar auditoria de habilidades", error),
  );
  return { response: redactResponseForRequester(outcome, { userId: scope.userId, isGameMaster: isGameMasterRole(user.role) }) };
}

export function registerDocumentHandlers(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker, userId: string): void {
  const scope: DocumentHandlerScope = { context, io, socket, presence, userId };
  const rateLimiter = new SocketRateLimiter(DOCUMENT_REQUEST_BURST, DOCUMENT_REQUESTS_PER_SECOND);

  socket.on(SOCKET_EVENTS.MODIFY_DOCUMENT, async (payload: unknown, acknowledgeCandidate: unknown) => {
    const acknowledge: Acknowledge = typeof acknowledgeCandidate === "function" ? (acknowledgeCandidate as Acknowledge) : () => undefined;
    if (!rateLimiter.tryConsume()) return acknowledge({ error: "Muitas alterações em pouco tempo, aguarde um instante" });
    try {
      acknowledge(await handleModifyDocument(scope, payload));
    } catch (error) {
      if (error instanceof HttpError) return acknowledge({ error: error.publicMessage });
      context.logger.error("Falha ao modificar documento", error);
      acknowledge({ error: "Erro interno do servidor" });
    }
  });
}
