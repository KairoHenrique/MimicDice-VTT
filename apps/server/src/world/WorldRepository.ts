import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CORE_RELEASE } from "@tabbletop/protocol";
import { isSafeEntryName, MAX_ENTRY_NAME_LENGTH, toSafeEntryName } from "../files/safeEntryName";
import { slugifyTitle } from "./documentIds";

const WORLD_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

const worldManifestSchema = z.object({
  id: z.string().regex(WORLD_ID_PATTERN),
  title: z.string().max(80),
  description: z.string().max(5000).default(""),
  system: z.string().nullable().default(null),
  coreVersion: z.string().default(CORE_RELEASE.version),
  created: z.string(),
  rpgFolder: z.string().max(MAX_ENTRY_NAME_LENGTH).optional(),
});

export type WorldManifest = z.infer<typeof worldManifestSchema>;

const serverOptionsSchema = z.object({ world: z.string().regex(/^[a-z0-9-]{1,64}$/).nullable().default(null) });

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class WorldRepository {
  constructor(
    private readonly worldsPath: string,
    private readonly configPath: string,
    private readonly rpgsPath: string,
  ) {}

  /**
   * The Game Master's private folder for this world, `rpgs/<world title>`. Created on first use and remembered in
   * the manifest so two worlds with the same title never share a folder.
   */
  async ensureRpgFolder(worldId: string): Promise<string> {
    const manifest = await this.readManifest(worldId);
    if (manifest.rpgFolder && isSafeEntryName(manifest.rpgFolder)) {
      const existing = path.join(this.rpgsPath, manifest.rpgFolder);
      await mkdir(existing, { recursive: true });
      return existing;
    }
    const folderName = await this.#allocateRpgFolderName(toSafeEntryName(manifest.title) ?? worldId);
    const directory = path.join(this.rpgsPath, folderName);
    await mkdir(directory, { recursive: true });
    await writeFile(this.#manifestPath(worldId), JSON.stringify({ ...manifest, rpgFolder: folderName }, null, 2), "utf8");
    return directory;
  }

  async #allocateRpgFolderName(baseName: string): Promise<string> {
    let candidate = baseName;
    for (let suffix = 2; await pathExists(path.join(this.rpgsPath, candidate)); suffix += 1) {
      candidate = `${baseName} (${suffix})`;
    }
    return candidate;
  }

  worldDirectory(worldId: string): string {
    return path.join(this.worldsPath, worldId);
  }

  worldDataDirectory(worldId: string): string {
    return path.join(this.worldDirectory(worldId), "data");
  }

  async readActiveWorldId(): Promise<string | null> {
    const optionsPath = path.join(this.configPath, "options.json");
    if (!(await pathExists(optionsPath))) return null;
    const options = serverOptionsSchema.parse(JSON.parse(await readFile(optionsPath, "utf8")));
    if (!options.world || !(await pathExists(this.#manifestPath(options.world)))) return null;
    return options.world;
  }

  async listWorlds(): Promise<WorldManifest[]> {
    if (!(await pathExists(this.worldsPath))) return [];
    const entries = await readdir(this.worldsPath, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && WORLD_ID_PATTERN.test(entry.name))
        .map((entry) => this.readManifest(entry.name).catch(() => null)),
    );
    return manifests.filter((manifest): manifest is WorldManifest => manifest !== null).sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
  }

  async worldExists(worldId: string): Promise<boolean> {
    return WORLD_ID_PATTERN.test(worldId) && pathExists(this.#manifestPath(worldId));
  }

  async rememberActiveWorld(worldId: string): Promise<void> {
    await this.#writeActiveWorldId(worldId);
  }

  async readManifest(worldId: string): Promise<WorldManifest> {
    return worldManifestSchema.parse(JSON.parse(await readFile(this.#manifestPath(worldId), "utf8")));
  }

  async createWorld(title: string): Promise<WorldManifest> {
    const worldId = await this.#allocateWorldId(slugifyTitle(title));
    const manifest: WorldManifest = {
      id: worldId,
      title,
      description: "",
      system: null,
      coreVersion: CORE_RELEASE.version,
      created: new Date().toISOString(),
    };
    await mkdir(this.worldDataDirectory(worldId), { recursive: true });
    await writeFile(this.#manifestPath(worldId), JSON.stringify(manifest, null, 2), "utf8");
    await this.ensureRpgFolder(worldId);
    await this.#writeActiveWorldId(worldId);
    return this.readManifest(worldId);
  }

  async setSystem(worldId: string, systemId: string | null): Promise<WorldManifest> {
    const manifest: WorldManifest = { ...(await this.readManifest(worldId)), system: systemId };
    await writeFile(this.#manifestPath(worldId), JSON.stringify(manifest, null, 2), "utf8");
    return manifest;
  }

  async #allocateWorldId(baseSlug: string): Promise<string> {
    let candidate = baseSlug;
    for (let suffix = 2; await pathExists(this.worldDirectory(candidate)); suffix += 1) {
      candidate = `${baseSlug}-${suffix}`;
    }
    return candidate;
  }

  async #writeActiveWorldId(worldId: string): Promise<void> {
    await mkdir(this.configPath, { recursive: true });
    await writeFile(path.join(this.configPath, "options.json"), JSON.stringify({ world: worldId }, null, 2), "utf8");
  }

  #manifestPath(worldId: string): string {
    return path.join(this.worldDirectory(worldId), "world.json");
  }
}
