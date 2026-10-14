import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS, tokenDragRequestSchema, type TokenDragBroadcast } from "@tabbletop/protocol";
import type { ServerContext } from "../ServerContext";
import { SocketRateLimiter } from "./SocketRateLimiter";

const DRAG_UPDATES_BURST = 30;
const DRAG_UPDATES_PER_SECOND = 25;

/**
 * Relays where a token is while its owner drags it, so the others watch it move. Only tokens the sender could
 * actually move are relayed; hidden tokens only reach the GMs. Nothing is stored: the drop is a normal update.
 */
export function attachTokenDragRelay(context: ServerContext, io: Server, socket: Socket, userId: string): void {
  const rateLimiter = new SocketRateLimiter(DRAG_UPDATES_BURST, DRAG_UPDATES_PER_SECOND);
  socket.on(SOCKET_EVENTS.TOKEN_DRAG, (payload: unknown) => {
    const world = context.activeWorld.current;
    const parsed = tokenDragRequestSchema.safeParse(payload);
    const user = world?.users.getUser(userId);
    if (!world || !user || !parsed.success || !rateLimiter.tryConsume()) return;
    const actor = { userId, role: user.role };
    const visible: TokenDragBroadcast["tokens"] = [];
    const hidden: TokenDragBroadcast["tokens"] = [];
    for (const token of parsed.data.tokens) {
      const inspection = world.documents.inspectTokenMove(actor, parsed.data.sceneId, token.tokenId);
      if (inspection) (inspection.hidden ? hidden : visible).push(token);
    }
    const message = { sceneId: parsed.data.sceneId, ended: parsed.data.ended === true, userId };
    if (visible.length > 0) socket.broadcast.emit(SOCKET_EVENTS.TOKEN_DRAG, { ...message, tokens: visible });
    if (hidden.length === 0) return;
    const gameMasterRooms = world.users
      .listPublicUsers()
      .filter((record) => record._id !== userId && world.users.isGameMaster(record._id))
      .map((record) => `user:${record._id}`);
    if (gameMasterRooms.length > 0) io.to(gameMasterRooms).emit(SOCKET_EVENTS.TOKEN_DRAG, { ...message, tokens: hidden });
  });
}
