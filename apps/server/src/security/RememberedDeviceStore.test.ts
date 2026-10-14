import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RememberedDeviceStore } from "./RememberedDeviceStore";

const USER_ID = "Fe6l11dE3rzjdedz";
const WORLD_ID = "mesa-teste";

describe("RememberedDeviceStore", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "remembered-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("never writes the raw token to disk and survives a restart", async () => {
    const store = RememberedDeviceStore.inConfigDirectory(directory);
    const { token } = await store.remember(USER_ID, WORLD_ID);
    const file = await readFile(path.join(directory, "remembered-devices.json"), "utf8");
    expect(file).not.toContain(token);
    const reloaded = RememberedDeviceStore.inConfigDirectory(directory);
    await reloaded.load();
    expect(reloaded.peek(token, WORLD_ID)).toBe(USER_ID);
    expect(reloaded.peek(token, "outro-mundo")).toBeNull();
  });

  it("rotates the token on use so an old copy stops working", async () => {
    const store = RememberedDeviceStore.inConfigDirectory(directory);
    const { token } = await store.remember(USER_ID, WORLD_ID);
    const rotated = await store.rotate(token, WORLD_ID);
    expect(rotated?.userId).toBe(USER_ID);
    expect(store.peek(token, WORLD_ID)).toBeNull();
    expect(store.peek(rotated?.device.token, WORLD_ID)).toBe(USER_ID);
  });

  it("forgets a device and rejects malformed tokens", async () => {
    const store = RememberedDeviceStore.inConfigDirectory(directory);
    const { token } = await store.remember(USER_ID, WORLD_ID);
    await store.forget(token);
    expect(store.peek(token, WORLD_ID)).toBeNull();
    expect(store.peek("../../etc/passwd", WORLD_ID)).toBeNull();
  });
});
