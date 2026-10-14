import { SOCKET_EVENTS, tokenDragBroadcastSchema, type TokenDragRequest } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";

const SEND_INTERVAL_MS = 50;
const STALE_PREVIEW_MS = 3_000;

type DraggedTokens = TokenDragRequest["tokens"];

/** Sends at most one position batch per interval while dragging, plus the final one on release. */
function createDragSender(socket: Socket): (tokens: DraggedTokens, ended: boolean) => void {
  let lastSentAt = 0;
  let pending: DraggedTokens | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const send = (tokens: DraggedTokens, ended: boolean) => {
    const sceneId = canvas.scene?.id;
    if (!sceneId) return;
    lastSentAt = Date.now();
    socket.emit(SOCKET_EVENTS.TOKEN_DRAG, { sceneId, tokens, ended } satisfies TokenDragRequest);
  };
  return (tokens, ended) => {
    if (ended) {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      send(tokens, true);
      return;
    }
    pending = tokens;
    const wait = SEND_INTERVAL_MS - (Date.now() - lastSentAt);
    if (wait <= 0) {
      send(tokens, false);
      pending = null;
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        if (pending) send(pending, false);
        pending = null;
      }, wait);
    }
  };
}

const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function showRemoteDrag(tokenId: string, point: { x: number; y: number } | null): void {
  const token = canvas.tokens?.get?.(tokenId);
  const existingTimer = staleTimers.get(tokenId);
  if (existingTimer) clearTimeout(existingTimer);
  staleTimers.delete(tokenId);
  if (!token || token.controlled) return;
  token.showLivePosition(point);
  if (point) staleTimers.set(tokenId, setTimeout(() => showRemoteDrag(tokenId, null), STALE_PREVIEW_MS));
}

/** Everyone watches a token glide while its owner drags it; the drop itself is the usual saved move. */
export function registerLiveTokenDrag(socket: Socket): void {
  const sendDrag = createDragSender(socket);
  Hooks.on("dragTokenPreview", (tokens: DraggedTokens, ended: boolean) => sendDrag(tokens, ended));
  socket.on(SOCKET_EVENTS.TOKEN_DRAG, (payload: unknown) => {
    const parsed = tokenDragBroadcastSchema.safeParse(payload);
    if (!parsed.success || !canvas.ready || canvas.scene?.id !== parsed.data.sceneId) return;
    for (const token of parsed.data.tokens) showRemoteDrag(token.tokenId, parsed.data.ended ? null : { x: token.x, y: token.y });
  });
}
