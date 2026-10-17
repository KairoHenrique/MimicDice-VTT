import { networkInterfaces } from "node:os";

export type InviteKind = "internet" | "radmin" | "lan" | "other";

export interface InviteAddress {
  kind: InviteKind;
  label: string;
  url: string;
}

const RADMIN_PREFIX = "26.";
const KIND_ORDER: Record<InviteKind, number> = { internet: -1, radmin: 0, lan: 1, other: 2 };
const KIND_LABELS: Record<Exclude<InviteKind, "internet">, string> = { radmin: "Radmin VPN", lan: "Rede local (mesma casa/Wi-Fi)", other: "Outra rede" };

/** The Cloudflare link, listed first because it works for anyone, with or without Radmin. */
export function internetInvite(url: string): InviteAddress {
  return { kind: "internet", label: "Pela internet (Cloudflare)", url };
}

function isPrivateLanAddress(address: string): boolean {
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}

function classifyAddress(address: string, interfaceName: string): Exclude<InviteKind, "internet"> {
  if (address.startsWith(RADMIN_PREFIX) || /radmin/i.test(interfaceName)) return "radmin";
  return isPrivateLanAddress(address) ? "lan" : "other";
}

/** IPv4 addresses friends can use to reach this machine, Radmin first. */
export function listInviteAddresses(port: number): InviteAddress[] {
  const addresses: InviteAddress[] = [];
  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal || entry.address.startsWith("169.254.")) continue;
      const kind = classifyAddress(entry.address, interfaceName);
      addresses.push({ kind, label: KIND_LABELS[kind], url: `http://${entry.address}:${port}` });
    }
  }
  return addresses.sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind]);
}
