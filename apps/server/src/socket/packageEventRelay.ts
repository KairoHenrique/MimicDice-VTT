import { MAX_PACKAGE_EVENT_BYTES, PACKAGE_EVENT_PREFIXES } from "@tabbletop/protocol";
import type { Socket } from "socket.io";
import type { ServerContext } from "../ServerContext";
import { readActiveModuleIds } from "../world/moduleConfiguration";

function estimatePayloadBytes(payload: unknown[]): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload) ?? "", "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isRelayablePackageEvent(context: ServerContext, eventName: string): boolean {
  const prefix = PACKAGE_EVENT_PREFIXES.find((candidate) => eventName.startsWith(candidate));
  if (!prefix) return false;
  const world = context.activeWorld.current;
  if (!world) return false;

  const packageId = eventName.slice(prefix.length);
  if (prefix === "system.") return world.manifest.system === packageId;
  return readActiveModuleIds(world).has(packageId);
}

export function attachPackageEventRelay(context: ServerContext, socket: Socket): void {
  socket.onAny((eventName: string, ...payload: unknown[]) => {
    if (typeof eventName !== "string" || !isRelayablePackageEvent(context, eventName)) return;
    const relayedPayload = typeof payload.at(-1) === "function" ? payload.slice(0, -1) : payload;
    if (estimatePayloadBytes(relayedPayload) > MAX_PACKAGE_EVENT_BYTES) return;
    socket.broadcast.emit(eventName, ...relayedPayload);
  });
}
