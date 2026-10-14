import { describe, expect, it } from "vitest";
import { DeviceFingerprinter } from "../security/DeviceFingerprinter";
import { BanService, type BanDocument } from "./BanService";
import type { DocumentCollectionStore } from "./WorldDatabase";

function memoryStore(): DocumentCollectionStore<BanDocument> {
  const documents = new Map<string, BanDocument>();
  return {
    get: async (id: string) => documents.get(id),
    getAll: async () => Array.from(documents.values()),
    put: async (document: BanDocument) => void documents.set(document._id, document),
    delete: async (id: string) => void documents.delete(id),
  } as unknown as DocumentCollectionStore<BanDocument>;
}

describe("BanService", () => {
  it("blocks the banned name in any letter case and every device the player used", async () => {
    const bans = new BanService(memoryStore());
    await bans.ban("Lyra", ["device-a", "device-b"]);
    expect(bans.isBanned("  lyra ", null)).toBe(true);
    expect(bans.isBanned("Outro Nome", "device-b")).toBe(true);
    expect(bans.isBanned("Outro Nome", "device-c")).toBe(false);
  });

  it("lets the player back in after an unban, and survives a reload", async () => {
    const store = memoryStore();
    const bans = new BanService(store);
    const ban = await bans.ban("Lyra", ["device-a"]);
    const reloaded = new BanService(store);
    await reloaded.load();
    expect(reloaded.isBanned("Lyra", null)).toBe(true);
    await reloaded.unban(ban._id);
    expect(reloaded.isBanned("Lyra", "device-a")).toBe(false);
    expect(reloaded.list()).toEqual([]);
  });

  it("merges a second ban of the same name instead of duplicating it", async () => {
    const bans = new BanService(memoryStore());
    await bans.ban("Lyra", ["device-a"]);
    await bans.ban("lyra", ["device-b"]);
    expect(bans.list()).toHaveLength(1);
    expect(bans.isBanned("Kael", "device-a")).toBe(true);
    expect(bans.isBanned("Kael", "device-b")).toBe(true);
  });
});

describe("DeviceFingerprinter", () => {
  const fingerprinter = new DeviceFingerprinter("test-secret-key-only-for-this-unit-test-00");

  it("never stores the address itself and gives IPv4-mapped addresses the same key", () => {
    const key = fingerprinter.keyFor("192.168.0.20");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("192");
    expect(fingerprinter.keyFor("::ffff:192.168.0.20")).toBe(key);
    expect(fingerprinter.keyFor("192.168.0.21")).not.toBe(key);
  });

  it("never fingerprints the host PC", () => {
    expect(fingerprinter.keyFor("127.0.0.1")).toBeNull();
    expect(fingerprinter.keyFor("::1")).toBeNull();
    expect(fingerprinter.keyFor(undefined)).toBeNull();
  });
});
