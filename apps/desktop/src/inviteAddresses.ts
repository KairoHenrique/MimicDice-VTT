import { networkInterfaces } from "node:os";

export type InviteKind = "radmin" | "lan" | "other";

export interface InviteAddress {
  kind: InviteKind;
  label: string;
  url: string;
}

const RADMIN_PREFIX = "26.";
const KIND_ORDER: Record<InviteKind, number> = { radmin: 0, lan: 1, other: 2 };
const KIND_LABELS: Record<InviteKind, string> = { radmin: "Radmin VPN", lan: "Rede local (mesma casa/Wi-Fi)", other: "Outra rede" };

function isPrivateLanAddress(address: string): boolean {
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}

function classifyAddress(address: string, interfaceName: string): InviteKind {
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
