import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { isLoopbackAddress } from "./networkAddress";

/** Header Cloudflare adds with the visitor's real address; it overwrites any value the visitor sends. */
const TUNNEL_CLIENT_HEADER = "cf-connecting-ip";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const UNKNOWN_TUNNEL_CLIENT = "tunnel-unknown";

export interface AddressedRequest {
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string | undefined };
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The local Cloudflare tunnel connects from loopback, so its visitors would pass for the host PC. They give
 * themselves away by the tunnel header or by asking for the public hostname instead of localhost.
 */
function arrivedThroughTunnel(request: AddressedRequest): boolean {
  if (headerValue(request.headers, TUNNEL_CLIENT_HEADER) !== undefined) return true;
  const hostname = hostnameOf(headerValue(request.headers, "host"));
  return hostname !== null && !LOOPBACK_HOSTNAMES.has(hostname);
}

/** True only for the PC running the server itself, never for someone coming in through the tunnel. */
export function isHostMachineRequest(request: AddressedRequest): boolean {
  return isLoopbackAddress(request.socket.remoteAddress) && !arrivedThroughTunnel(request);
}

/**
 * Address used for rate limits, device bans and logs. The tunnel header is trusted only on loopback connections:
 * anyone on the LAN or Radmin connects directly, so a forged header from them is ignored.
 */
export function clientAddressOf(request: AddressedRequest): string | undefined {
  const socketAddress = request.socket.remoteAddress;
  if (!isLoopbackAddress(socketAddress) || !arrivedThroughTunnel(request)) return socketAddress;
  const forwarded = headerValue(request.headers, TUNNEL_CLIENT_HEADER)?.trim();
  return forwarded && isIP(forwarded) ? forwarded : UNKNOWN_TUNNEL_CLIENT;
}
