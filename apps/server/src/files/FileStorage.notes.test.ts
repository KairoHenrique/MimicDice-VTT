import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStorage, parseTarget } from "./FileStorage";
import { PlayerFileArea } from "./PlayerFileArea";
import type { PlayerFolderSharing } from "./PlayerFolderSharing";

describe("note files", () => {
  let dataPath: string;
  let storage: FileStorage;
  const noSharing = { sharedFoldersOf: async () => new Set<string>(), allShared: async () => new Map() } as unknown as PlayerFolderSharing;

  beforeEach(async () => {
    dataPath = await mkdtemp(path.join(tmpdir(), "mimic-notes-"));
    storage = new FileStorage(dataPath);
  });

  afterEach(async () => {
    await rm(dataPath, { recursive: true, force: true });
  });

  it("saves and reads a note, cleaning the file name", async () => {
    const saved = await storage.writeNote("uploads/players/abc/Diário da sessão.md", "# Sessão 1\nO grupo chegou.");
    expect(saved).toBe("uploads/players/abc/Diario-da-sessao.md");
    expect(await storage.readNote(parseTarget(saved))).toBe("# Sessão 1\nO grupo chegou.");
  });

  it("refuses notes that are not .md or .txt", async () => {
    await expect(storage.writeNote("uploads/players/abc/script.html", "<script></script>")).rejects.toThrow();
    await expect(storage.readNote(parseTarget("uploads/players/abc/mapa.png"))).rejects.toThrow();
  });

  it("keeps a player's notes inside their own folder", async () => {
    const area = new PlayerFileArea(storage, noSharing, () => "Ana");
    expect(area.noteWriteTarget("abc", "uploads/players/abc/notas.md")).toBe("uploads/players/abc/notas.md");
    expect(() => area.noteWriteTarget("abc", "uploads/players/xyz/notas.md")).toThrow();
    expect(() => area.noteWriteTarget("abc", "uploads/mestre.md")).toThrow();
    await expect(area.noteAccess("abc", "uploads/segredo.md")).rejects.toThrow();
  });
});
