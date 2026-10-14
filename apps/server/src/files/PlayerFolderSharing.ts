import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const MAX_SHARED_FOLDERS_PER_USER = 200;
const FOLDER_NAME_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/;
const USER_ID_PATTERN = /^[A-Za-z0-9]{1,32}$/;

const sharingFileSchema = z.record(z.string().regex(USER_ID_PATTERN), z.array(z.string().regex(FOLDER_NAME_PATTERN)).max(MAX_SHARED_FOLDERS_PER_USER));

/**
 * Which of a player's top-level upload folders the rest of the group may browse. Kept outside the uploads area so
 * nobody can download or overwrite it, and written atomically one change at a time.
 */
export class PlayerFolderSharing {
  readonly #filePath: string;
  #shared: Map<string, Set<string>> | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(configDirectory: string) {
    this.#filePath = path.join(configDirectory, "player-folder-sharing.json");
  }

  async sharedFoldersOf(userId: string): Promise<ReadonlySet<string>> {
    return (await this.#load()).get(userId) ?? new Set();
  }

  async allShared(): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    return this.#load();
  }

  async setShared(userId: string, folderName: string, shared: boolean): Promise<void> {
    if (!USER_ID_PATTERN.test(userId) || !FOLDER_NAME_PATTERN.test(folderName)) throw new Error("Pasta inválida");
    const change = this.#queue.then(async () => {
      const state = await this.#load();
      const folders = new Set(state.get(userId) ?? []);
      if (shared) folders.add(folderName);
      else folders.delete(folderName);
      if (folders.size > MAX_SHARED_FOLDERS_PER_USER) throw new Error("Pastas compartilhadas demais");
      if (folders.size === 0) state.delete(userId);
      else state.set(userId, folders);
      await this.#persist(state);
    });
    this.#queue = change.catch(() => undefined);
    await change;
  }

  async #load(): Promise<Map<string, Set<string>>> {
    if (this.#shared) return this.#shared;
    let parsed: Record<string, string[]> = {};
    try {
      const result = sharingFileSchema.safeParse(JSON.parse(await readFile(this.#filePath, "utf8")));
      if (result.success) parsed = result.data;
    } catch {
      // A missing or unreadable file means nothing is shared yet.
    }
    this.#shared = new Map(Object.entries(parsed).map(([userId, folders]) => [userId, new Set(folders)]));
    return this.#shared;
  }

  async #persist(state: Map<string, Set<string>>): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    const content = JSON.stringify(Object.fromEntries(Array.from(state, ([userId, folders]) => [userId, [...folders].sort()])));
    const partialPath = `${this.#filePath}.${randomBytes(6).toString("hex")}.part`;
    try {
      await writeFile(partialPath, content, { flag: "wx" });
      await rename(partialPath, this.#filePath);
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }
  }
}
