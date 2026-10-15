import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStorage } from "./FileStorage";
import { PlayerFileArea } from "./PlayerFileArea";
import { PlayerFolderSharing } from "./PlayerFolderSharing";

const PNG_HEADER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const NAMES: Record<string, string> = { ana: "Ana", bia: "Bia" };

describe("PlayerFileArea", () => {
  let dataPath: string;
  let storage: FileStorage;
  let area: PlayerFileArea;

  beforeEach(async () => {
    dataPath = await mkdtemp(path.join(os.tmpdir(), "md-files-"));
    storage = new FileStorage(dataPath);
    area = new PlayerFileArea(storage, new PlayerFolderSharing(path.join(dataPath, "config")), (userId) => NAMES[userId] ?? null);
    await storage.upload("uploads/mapas", "segredo.png", PNG_HEADER);
    await storage.upload("uploads/players/bia/retratos", "bia.png", PNG_HEADER);
    await storage.upload("uploads/players/bia/rascunhos", "nota.png", PNG_HEADER);
  });

  afterEach(async () => {
    await rm(dataPath, { recursive: true, force: true });
  });

  it("lets the GM see every upload folder, with the players' folders named after them", async () => {
    const uploads = await area.labelPlayerFolders(await storage.browse("uploads", null));
    expect(uploads.dirs).toContain("uploads/mapas");
    expect(uploads.labels?.["uploads/players"]).toBe("Pastas dos jogadores");
    const players = await area.labelPlayerFolders(await storage.browse("uploads/players", null));
    expect(players.labels?.["uploads/players/bia"]).toBe("Pasta de Bia");
  });

  it("never shows the GM's folders to a player", async () => {
    for (const target of ["", "uploads", "uploads/mapas", "modules", "uploads/players/bia/retratos"]) {
      const listing = await area.browse("ana", target, null);
      expect(listing.target).toBe("uploads/players/ana");
      expect(listing.files).toEqual([]);
      expect(listing.dirs).toEqual(["uploads/players"]);
    }
  });

  it("shows only the folders another player shared, read-only", async () => {
    await area.setShared("bia", "uploads/players/bia/retratos", true);
    const own = await area.browse("ana", "", null);
    expect(own.dirs).toEqual(["uploads/players"]);
    expect(own.labels?.["uploads/players"]).toBe("Pastas compartilhadas");
    const group = await area.browse("ana", "uploads/players", null);
    expect(group.dirs).toEqual(["uploads/players/bia/retratos"]);
    expect(group.parent).toBe("uploads/players/ana");
    expect(group.labels?.["uploads/players/bia/retratos"]).toBe("retratos (de Bia)");
    const shared = await area.browse("ana", "uploads/players/bia/retratos", null);
    expect(shared.files).toEqual(["uploads/players/bia/retratos/bia.png"]);
    expect(shared.writable).toBe(false);
    expect((await area.browse("ana", "uploads/players/bia/rascunhos", null)).target).toBe("uploads/players/ana");
  });

  it("marks the owner's shareable folders and keeps writes in their folder", async () => {
    await area.setShared("bia", "uploads/players/bia/retratos", true);
    const own = await area.browse("bia", "uploads/players/bia", null);
    expect(own.dirs).toEqual(["uploads/players", "uploads/players/bia/rascunhos", "uploads/players/bia/retratos"]);
    expect(own.shareable).toEqual({ "uploads/players/bia/rascunhos": false, "uploads/players/bia/retratos": true });
    expect(area.writableTarget("ana", "uploads/players/bia/retratos")).toBe("uploads/players/ana");
    expect(() => area.newFolderTarget("ana", "uploads/novapasta")).toThrow();
    await expect(area.setShared("ana", "uploads/players/bia/rascunhos", true)).rejects.toThrow();
  });

  it("lets a player delete only inside their own folder", () => {
    expect(area.deletableTarget("bia", "uploads/players/bia/retratos/bia.png")).toBe("uploads/players/bia/retratos/bia.png");
    expect(() => area.deletableTarget("bia", "uploads/players/bia")).toThrow();
    expect(() => area.deletableTarget("ana", "uploads/players/bia/retratos/bia.png")).toThrow();
    expect(() => area.deletableTarget("bia", "uploads/mapas/segredo.png")).toThrow();
  });
});

describe("FileStorage.deletePaths", () => {
  let dataPath: string;
  let storage: FileStorage;

  beforeEach(async () => {
    dataPath = await mkdtemp(path.join(os.tmpdir(), "md-delete-"));
    storage = new FileStorage(dataPath);
    await storage.upload("uploads/mapas", "a.png", PNG_HEADER);
    await storage.upload("uploads/mapas/sala", "b.png", PNG_HEADER);
  });

  afterEach(async () => {
    await rm(dataPath, { recursive: true, force: true });
  });

  it("deletes files and folders under uploads", async () => {
    expect(await storage.deletePaths(["uploads/mapas/a.png"])).toEqual(["uploads/mapas/a.png"]);
    expect((await storage.browse("uploads/mapas", null)).files).toEqual([]);
    expect(await storage.deletePaths(["uploads/mapas/sala"])).toEqual(["uploads/mapas/sala"]);
    expect((await storage.browse("uploads/mapas", null)).dirs).toEqual([]);
  });

  it("skips missing paths and refuses the uploads root or outside it", async () => {
    expect(await storage.deletePaths(["uploads/mapas/nao-existe.png"])).toEqual([]);
    await expect(storage.deletePaths(["uploads"])).rejects.toThrow();
    await expect(storage.deletePaths(["modules/x"])).rejects.toThrow();
    await expect(storage.deletePaths(["uploads/../config"])).rejects.toThrow();
  });
});
