import { describe, expect, it, vi } from "vitest";

vi.mock("node:os", () => ({
  networkInterfaces: () => ({
    "Wi-Fi": [
      { family: "IPv4", internal: false, address: "192.168.1.104" },
      { family: "IPv6", internal: false, address: "fe80::1" },
    ],
    Loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    "Radmin VPN": [{ family: "IPv4", internal: false, address: "26.69.98.185" }],
    Ethernet: [{ family: "IPv4", internal: false, address: "169.254.10.2" }],
  }),
}));

const { listInviteAddresses } = await import("./inviteAddresses");

describe("listInviteAddresses", () => {
  it("lists Radmin first, then LAN, skipping loopback, IPv6 and link-local", () => {
    expect(listInviteAddresses(30000)).toEqual([
      { kind: "radmin", label: "Radmin VPN", url: "http://26.69.98.185:30000" },
      { kind: "lan", label: "Rede local (mesma casa/Wi-Fi)", url: "http://192.168.1.104:30000" },
    ]);
  });
});
