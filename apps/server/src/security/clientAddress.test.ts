import { describe, expect, it } from "vitest";
import { clientAddressOf, isHostMachineRequest, type AddressedRequest } from "./clientAddress";

function request(remoteAddress: string, headers: Record<string, string> = {}): AddressedRequest {
  return { socket: { remoteAddress }, headers };
}

describe("isHostMachineRequest", () => {
  it("accepts the host PC opening localhost", () => {
    expect(isHostMachineRequest(request("127.0.0.1", { host: "localhost:30000" }))).toBe(true);
    expect(isHostMachineRequest(request("::1", { host: "127.0.0.1:30000" }))).toBe(true);
  });

  it("rejects tunnel visitors even though they arrive from loopback", () => {
    expect(isHostMachineRequest(request("127.0.0.1", { host: "abc.trycloudflare.com", "cf-connecting-ip": "200.1.2.3" }))).toBe(false);
    expect(isHostMachineRequest(request("127.0.0.1", { host: "abc.trycloudflare.com" }))).toBe(false);
    expect(isHostMachineRequest(request("127.0.0.1", { host: "localhost:30000", "cf-connecting-ip": "200.1.2.3" }))).toBe(false);
  });

  it("rejects friends on the LAN or Radmin", () => {
    expect(isHostMachineRequest(request("192.168.0.20", { host: "192.168.0.10:30000" }))).toBe(false);
    expect(isHostMachineRequest(request("26.10.0.5", { host: "26.69.98.185:30000" }))).toBe(false);
  });
});

describe("clientAddressOf", () => {
  it("uses the real visitor address that the tunnel reports", () => {
    expect(clientAddressOf(request("127.0.0.1", { host: "abc.trycloudflare.com", "cf-connecting-ip": "200.1.2.3" }))).toBe("200.1.2.3");
  });

  it("ignores the tunnel header from anyone who is not on loopback", () => {
    expect(clientAddressOf(request("192.168.0.20", { "cf-connecting-ip": "127.0.0.1" }))).toBe("192.168.0.20");
  });

  it("never lets a tunnel visitor pass for the host PC", () => {
    expect(clientAddressOf(request("127.0.0.1", { host: "abc.trycloudflare.com", "cf-connecting-ip": "not-an-ip" }))).toBe("tunnel-unknown");
    expect(clientAddressOf(request("127.0.0.1", { host: "abc.trycloudflare.com" }))).toBe("tunnel-unknown");
  });

  it("keeps the socket address for the host PC itself", () => {
    expect(clientAddressOf(request("127.0.0.1", { host: "localhost:30000" }))).toBe("127.0.0.1");
  });
});
