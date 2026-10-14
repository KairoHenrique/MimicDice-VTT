import { isIP } from "node:net";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  return remoteAddress !== undefined && LOOPBACK_ADDRESSES.has(remoteAddress);
}

export function maskAddress(remoteAddress: string | undefined): string {
  if (!remoteAddress) return "unknown";
  const address = remoteAddress.replace(/^::ffff:/, "");
  if (isIP(address) === 4) {
    const [first, second] = address.split(".");
    return `${first}.${second}.x.x`;
  }
  return `${address.split(":").slice(0, 2).join(":")}:…`;
}

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((accumulator, octet) => (accumulator << 8) + Number(octet), 0) >>> 0;
}

const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["26.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
];

export function isPrivateNetworkAddress(rawAddress: string): boolean {
  const address = rawAddress.replace(/^::ffff:/, "");
  if (isIP(address) === 4) {
    const numeric = ipv4ToNumber(address);
    return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (numeric & mask) === (ipv4ToNumber(base) & mask);
    });
  }
  const lowered = address.toLowerCase();
  return lowered === "::1" || lowered === "::" || lowered.startsWith("fc") || lowered.startsWith("fd") || lowered.startsWith("fe80");
}
