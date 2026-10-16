import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRpgPath, RpgFileManager } from "./RpgFileManager";
import { toSafeEntryName } from "./safeEntryName";

describe("toSafeEntryName", () => {
  it("keeps readable names and strips characters invalid on Windows", () => {
    expect(toSafeEntryName("  A Maldição de Strahd  ")).toBe("A Maldição de Strahd");
    expect(toSafeEntryName('Mapa: "Cidade" <1>?')).toBe("Mapa Cidade 1");
    expect(toSafeEntryName("...")).toBeNull();
    expect(toSafeEntryName("CON")).toBeNull();
  });
});

describe("parseRpgPath", () => {
  it("rejects traversal and hidden segments", () => {
    expect(parseRpgPath("Mapas/Cidade")).toEqual(["Mapas", "Cidade"]);
    expect(() => parseRpgPath("../config")).toThrow();
    expect(() => parseRpgPath("Mapas/../../x")).toThrow();
    expect(() => parseRpgPath(".segredo")).toThrow();
    expect(() => parseRpgPath("C:/Windows")).toThrow();
  });
});

describe("RpgFileManager", () => {
  let root: string;
  let manager: RpgFileManager;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "rpgs-test-"));
    manager = new RpgFileManager(path.join(root, "Mesa"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates, renames, moves and deletes entries inside the world folder", async () => {
    await manager.createFolder("", "Mapas");
    await manager.createFolder("", "Notas");
    await manager.writeText("Notas/sessao 1.md", "# Sessão 1");
    expect(await manager.readText("Notas/sessao 1.md")).toBe("# Sessão 1");
    expect(await manager.rename("Notas/sessao 1.md", "Sessão 1.md")).toBe("Notas/Sessão 1.md");
    expect(await manager.move("Notas/Sessão 1.md", "Mapas")).toBe("Mapas/Sessão 1.md");
    const listing = await manager.list("");
    expect(listing.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual(["folder:Mapas", "folder:Notas"]);
    await expect(manager.move("Mapas", "Mapas")).rejects.toThrow();
    await manager.remove("Mapas");
    expect((await manager.list("")).entries.map((entry) => entry.name)).toEqual(["Notas"]);
    await expect(manager.remove("")).rejects.toThrow();
  });

  it("streams uploads and never overwrites an existing file", async () => {
    const first = await manager.upload("", "mapa.png", Readable.from([Buffer.from("um")]));
    const second = await manager.upload("", "mapa.png", Readable.from([Buffer.from("dois")]));
    expect(first).toBe("mapa.png");
    expect(second).toBe("mapa (2).png");
    expect(await readFile(path.join(root, "Mesa", "mapa (2).png"), "utf8")).toBe("dois");
    expect((await manager.list("")).entries).toHaveLength(2);
  });

  it("copies entries and deletes several at once", async () => {
    await manager.createFolder("", "Origem");
    await manager.createFolder("", "Destino");
    await manager.writeText("Origem/nota.md", "ola");
    expect(await manager.copy("Origem/nota.md", "Destino")).toBe("Destino/nota.md");
    expect(await manager.readText("Destino/nota.md")).toBe("ola");
    expect(await manager.copy("Origem/nota.md", "Destino")).toBe("Destino/nota (2).md");
    await manager.removeMany(["Destino/nota.md", "Destino/nota (2).md", "Origem"]);
    expect((await manager.list("")).entries.map((entry) => entry.name)).toEqual(["Destino"]);
    expect((await manager.list("Destino")).entries).toEqual([]);
  });
});
