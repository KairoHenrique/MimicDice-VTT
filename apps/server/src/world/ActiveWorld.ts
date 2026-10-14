import { mkdir } from "node:fs/promises";
import type { ConfiguredPermissions } from "@tabbletop/common";
import {
  MAP_LOCKED_SETTING_KEY,
  parseTokenMoveRule,
  PLAYER_SHEET_EDITING_SETTING_KEY,
  SCENE_PAUSED_SETTING_KEY,
  TABLE_SESSION_OPEN_SETTING_KEY,
  TOKEN_MOVE_RULE_SETTING_KEY,
  type DocumentSource,
} from "@tabbletop/protocol";
import { DocumentPermissionPolicy } from "../documents/DocumentPermissionPolicy";
import { DocumentService } from "../documents/DocumentService";
import { DocumentSourceValidator } from "../documents/DocumentSourceValidator";
import { DocumentStore } from "../documents/DocumentStore";
import { DoorAccessPolicy } from "../documents/DoorAccessPolicy";
import { SystemDocumentModel } from "../documents/SystemDocumentModel";
import type { Logger } from "../logging/logger";
import type { PackageRegistry } from "../packages/PackageRegistry";
import type { PasswordHasher } from "../security/PasswordHasher";
import { BanService, type BanDocument } from "./BanService";
import { SettingService } from "./SettingService";
import { UserService, type UserDocument } from "./UserService";
import { WorldDatabase, type WorldCollectionName } from "./WorldDatabase";
import type { WorldManifest, WorldRepository } from "./WorldRepository";

const DOCUMENT_COLLECTIONS: readonly WorldCollectionName[] = ["actors", "items", "journal", "folders", "messages", "scenes", "combats"];

export interface ActiveWorldDependencies {
  passwordHasher: PasswordHasher;
  packageRegistry: PackageRegistry;
  logger: Logger;
}

export class ActiveWorld {
  private constructor(
    readonly manifest: WorldManifest,
    readonly users: UserService,
    readonly bans: BanService,
    readonly settings: SettingService,
    readonly documents: DocumentService,
    readonly systemModel: SystemDocumentModel,
    /** Absolute path of `rpgs/<world>`, the Game Master's private file area. */
    readonly rpgDirectory: string,
    private readonly database: WorldDatabase,
  ) {}

  static async open(repository: WorldRepository, worldId: string, dependencies: ActiveWorldDependencies): Promise<ActiveWorld> {
    const rpgDirectory = await repository.ensureRpgFolder(worldId);
    const manifest = await repository.readManifest(worldId);
    const dataDirectory = repository.worldDataDirectory(worldId);
    await mkdir(dataDirectory, { recursive: true });
    const database = new WorldDatabase(dataDirectory);

    const users = new UserService(await database.collection<UserDocument>("users"), dependencies.passwordHasher);
    const bans = new BanService(await database.collection<BanDocument>("bans"));
    const settings = new SettingService(await database.collection("settings"));
    const stores = await Promise.all(
      DOCUMENT_COLLECTIONS.map(async (name) => new DocumentStore(name, await database.collection<DocumentSource>(name), dependencies.logger)),
    );
    await Promise.all([users.load(), bans.load(), settings.load(), ...stores.map((store) => store.load())]);

    const system = manifest.system ? dependencies.packageRegistry.find("system", manifest.system) : undefined;
    const systemModel = await SystemDocumentModel.load(system, dependencies.logger);
    const actorStore = stores.find((store) => store.collectionName === "actors");
    const readConfiguredPermissions = () => settings.readWorldValue<ConfiguredPermissions>("core.permissions") ?? {};
    const permissions = new DocumentPermissionPolicy(
      readConfiguredPermissions,
      (actorId) => actorStore?.get(actorId),
      () => settings.readWorldValue<boolean>(MAP_LOCKED_SETTING_KEY) === true,
      () => settings.readWorldValue<boolean>(SCENE_PAUSED_SETTING_KEY) === true,
      () => settings.readWorldValue<boolean>(TABLE_SESSION_OPEN_SETTING_KEY) !== true,
      () => parseTokenMoveRule(settings.readWorldValue<string>(TOKEN_MOVE_RULE_SETTING_KEY)),
      () => settings.readWorldValue<boolean>(PLAYER_SHEET_EDITING_SETTING_KEY) === true,
    );
    const doorAccess = new DoorAccessPolicy(permissions, readConfiguredPermissions, () => actorStore?.values() ?? []);
    const documents = new DocumentService(stores, new DocumentSourceValidator(systemModel, manifest.system), permissions, doorAccess);
    return new ActiveWorld(manifest, users, bans, settings, documents, systemModel, rpgDirectory, database);
  }

  async close(): Promise<void> {
    await this.documents.flush();
    await this.database.close();
  }
}

export class ActiveWorldHolder {
  #activeWorld: ActiveWorld | undefined;
  #switching = false;
  readonly #reloadListeners = new Set<() => void>();

  constructor(
    private readonly repository: WorldRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly packageRegistry: PackageRegistry,
    private readonly logger: Logger,
  ) {}

  get current(): ActiveWorld | undefined {
    return this.#activeWorld;
  }

  async openConfiguredWorld(): Promise<ActiveWorld | undefined> {
    const worldId = await this.repository.readActiveWorldId();
    if (!worldId) return undefined;
    return this.activate(worldId);
  }

  async activate(worldId: string): Promise<ActiveWorld> {
    await this.#activeWorld?.close();
    this.#activeWorld = await ActiveWorld.open(this.repository, worldId, {
      passwordHasher: this.passwordHasher,
      packageRegistry: this.packageRegistry,
      logger: this.logger,
    });
    return this.#activeWorld;
  }

  /** Changes the world's game system and reopens it, so documents are validated against the new data model. */
  async changeSystem(systemId: string | null): Promise<ActiveWorld> {
    const current = this.#activeWorld;
    if (!current) throw new Error("No active world");
    await this.repository.setSystem(current.manifest.id, systemId);
    const reopened = await this.activate(current.manifest.id);
    for (const listener of this.#reloadListeners) listener();
    return reopened;
  }

  listWorlds(): Promise<WorldManifest[]> {
    return this.repository.listWorlds();
  }

  /**
   * Opens another world, remembers it for the next start and reloads every client. Each world keeps its own
   * Game Master accounts and passwords; a brand-new world has none, so the host PC is asked to set it up.
   */
  async switchTo(worldId: string): Promise<ActiveWorld> {
    if (!(await this.repository.worldExists(worldId))) throw new Error("Unknown world");
    return this.#exclusive(async () => {
      const world = await this.activate(worldId);
      await this.repository.rememberActiveWorld(worldId);
      for (const listener of this.#reloadListeners) listener();
      return world;
    });
  }

  async createAndSwitch(title: string): Promise<ActiveWorld> {
    const manifest = await this.repository.createWorld(title);
    return this.switchTo(manifest.id);
  }

  /** The open world holds its database lock, so only closed worlds can be deleted. */
  async deleteWorld(worldId: string): Promise<void> {
    await this.#exclusive(async () => {
      if (worldId === this.#activeWorld?.manifest.id) throw new Error("World is open");
      await this.repository.deleteWorld(worldId);
    });
  }

  async #exclusive<T>(task: () => Promise<T>): Promise<T> {
    if (this.#switching) throw new Error("World switch already in progress");
    this.#switching = true;
    try {
      return await task();
    } finally {
      this.#switching = false;
    }
  }

  onReloaded(listener: () => void): void {
    this.#reloadListeners.add(listener);
  }

  async close(): Promise<void> {
    await this.#activeWorld?.close();
    this.#activeWorld = undefined;
  }
}
