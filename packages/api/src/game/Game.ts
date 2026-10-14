import {
  SOCKET_EVENTS,
  type ModifyDocumentResponse,
  type OnlineUserRecord,
  type ReleaseRecord,
  type SettingRecord,
  type WorldSnapshot,
} from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { AudioHelper } from "../audio/AudioHelper";
import { ClientDatabaseBackend } from "../documents/abstract/ClientDatabaseBackend";
import { ToursCollection } from "../nue/Tour";
import { Hooks } from "../hooks/Hooks";
import { Localization } from "../i18n/Localization";
import { Canvas } from "../canvas/Canvas";
import { currentConfig, defineGlobal } from "../runtime";
import { ClientSettings, type SettingStorageBackend } from "../settings/ClientSettings";
import { Collection } from "../utils/Collection";
import { Keybindings } from "./Keybindings";
import { KeyboardManager } from "./KeyboardManager";
import { VideoHelper } from "../helpers/media";
import { TooltipManager } from "../helpers/TooltipManager";
import { Module, System, World } from "./Package";
import { User, Users } from "./User";

export interface GameLifecycleCallbacks {
  registerCoreSettings(settings: ClientSettings): void;
  renderInterface(): Promise<void>;
  onSessionEnded(): void;
}

const WORLD_DOCUMENT_COLLECTIONS: ReadonlyArray<[documentName: string, collectionName: string]> = [
  ["Folder", "folders"],
  ["Actor", "actors"],
  ["Item", "items"],
  ["JournalEntry", "journal"],
  ["ChatMessage", "messages"],
  ["Scene", "scenes"],
  ["Combat", "combats"],
];

const UNTYPED_DOCUMENTS = ["JournalEntry", "Folder", "User", "ChatMessage", "Scene", "Token", "Tile", "Wall", "AmbientLight", "Note", "Drawing", "MeasuredTemplate"];
const BOARD_ELEMENT_ID = "board";

function createSocketSettingBackend(socket: Socket): SettingStorageBackend {
  return {
    async persistRemote(key, scope, serializedValue) {
      const response = (await socket.timeout(10_000).emitWithAck(SOCKET_EVENTS.MODIFY_SETTING, { key, scope, value: serializedValue })) as {
        setting?: SettingRecord;
        error?: string;
      };
      if (!response?.setting) throw new Error(response?.error ?? "Failed to save setting");
      return response.setting;
    },
  };
}

function documentTypesFrom(model: WorldSnapshot["model"]): Record<string, string[]> {
  const documentTypes: Record<string, string[]> = {};
  for (const [documentName, subtypes] of Object.entries(model)) documentTypes[documentName] = Object.keys(subtypes);
  for (const documentName of UNTYPED_DOCUMENTS) documentTypes[documentName] = ["base"];
  return documentTypes;
}

export class Game {
  readonly data: WorldSnapshot;
  readonly userId: string;
  readonly world: World;
  readonly system: System | null;
  readonly modules = new Collection<Module>();
  readonly users = new Users();
  readonly settings: ClientSettings;
  readonly i18n: Localization;
  readonly keybindings = new Keybindings();
  readonly keyboard = new KeyboardManager();
  readonly tooltip = new TooltipManager();
  readonly video = VideoHelper.getInstance();
  readonly release: ReleaseRecord;
  readonly collections = new Collection<any>();
  readonly packs = new Collection<unknown>();
  readonly model: WorldSnapshot["model"];
  readonly documentTypes: Record<string, string[]>;
  readonly view = "game";
  readonly audio = new AudioHelper();
  readonly tours = new ToursCollection();
  ready = false;
  paused = false;
  readonly canvas = new Canvas();
  _documentsReady = false;

  get combats(): any {
    return this.collections.get("Combat");
  }

  /** The encounter shown in the tracker: the active one of the viewed scene, else its first. */
  get combat(): any {
    return this.combats?.viewed ?? null;
  }

  constructor(
    snapshot: WorldSnapshot,
    readonly socket: Socket,
    private readonly lifecycle: GameLifecycleCallbacks,
    languageCode: string,
  ) {
    this.data = snapshot;
    this.userId = snapshot.userId;
    this.release = Object.freeze({ ...snapshot.release });
    this.model = snapshot.model;
    this.documentTypes = documentTypesFrom(snapshot.model);
    if (typeof window !== "undefined") {
      this.keyboard.activateListeners(window);
      this.tooltip.activateEventListeners();
    }
    this.world = new World(snapshot.world.id, snapshot.world.title, snapshot.world.description, snapshot.world.system, snapshot.world.coreVersion);
    this.system = snapshot.system ? new System(snapshot.system) : null;
    for (const moduleRecord of snapshot.modules) this.modules.set(moduleRecord.id, new Module(moduleRecord));
    currentConfig().DatabaseBackend = new ClientDatabaseBackend(socket);
    for (const userRecord of snapshot.users) this.users.set(userRecord._id, User.fromRecord(userRecord));
    this.collections.set("User", this.users);
    this.settings = new ClientSettings(snapshot.settings, createSocketSettingBackend(socket));
    this.i18n = new Localization(languageCode);
    defineGlobal("canvas", this.canvas);
  }

  get version(): string {
    return this.release.version;
  }

  get user(): User | undefined {
    return this.users.get(this.userId);
  }

  get activeModules(): Module[] {
    return this.modules.filter((module) => module.active);
  }

  get actors(): any {
    return this.collections.get("Actor");
  }

  get items(): any {
    return this.collections.get("Item");
  }

  get journal(): any {
    return this.collections.get("JournalEntry");
  }

  get folders(): any {
    return this.collections.get("Folder");
  }

  get messages(): any {
    return this.collections.get("ChatMessage");
  }

  get scenes(): any {
    return this.collections.get("Scene");
  }

  async initialize(): Promise<void> {
    this.lifecycle.registerCoreSettings(this.settings);
    Hooks.callAll("init");

    const activePackages = [this.data.system, ...this.data.modules.filter((module) => module.active)].filter((record) => record !== null);
    await this.i18n.initialize(activePackages);
    Hooks.callAll("i18nInit");
    await this.setupGame();
  }

  async setupGame(): Promise<void> {
    Hooks.callAll("setup");
    this.initializeDocuments();
    this.#activateSocketListeners();
    await this.lifecycle.renderInterface();
    await this.#initializeCanvas();
    this.ready = true;
    Hooks.callAll("ready");
  }

  /** Builds world collections with the (possibly system-replaced) document classes, then prepares derived data once. */
  initializeDocuments(): void {
    const config = currentConfig();
    for (const [documentName, collectionName] of WORLD_DOCUMENT_COLLECTIONS) {
      const CollectionClass = config[documentName].collection;
      const DocumentClass = config[documentName].documentClass;
      const collection = new CollectionClass();
      for (const source of this.data.documents[collectionName] ?? []) {
        try {
          const document = new DocumentClass(source);
          collection.set(document.id, document);
        } catch (error) {
          Hooks.onError("Game#initializeDocuments", error, { msg: `Failed to initialize ${documentName} [${source._id}]`, log: "error" });
        }
      }
      this.collections.set(documentName, collection);
    }
    this._documentsReady = true;
    for (const collection of this.collections.values()) {
      for (const document of collection.values()) document._safePrepareData?.();
    }
  }

  async #initializeCanvas(): Promise<void> {
    const board = document.getElementById(BOARD_ELEMENT_ID);
    if (!board || this.settings.get("core", "noCanvas") === true) return;
    try {
      this.canvas.initialize(board);
    } catch (error) {
      Hooks.onError("Game#initializeCanvas", error, { msg: "WebGL indisponível: a mesa não pôde ser desenhada", log: "error", notify: "error" });
      return;
    }
    await this.canvas.draw(this.scenes?.active ?? null);
  }

  togglePause(pause?: boolean): void {
    this.paused = pause ?? !this.paused;
    Hooks.callAll("pauseGame", this.paused);
  }

  #activateSocketListeners(): void {
    this.socket.on(SOCKET_EVENTS.SETTING_UPDATED, (record: SettingRecord) => this.settings.applyRemoteRecord(record));
    this.socket.on(SOCKET_EVENTS.MODIFY_DOCUMENT, (response: ModifyDocumentResponse) => {
      try {
        currentConfig().DatabaseBackend.handleModifyDocument(response);
      } catch (error) {
        Hooks.onError("Game#modifyDocument", error, { log: "error" });
      }
    });
    this.socket.on(SOCKET_EVENTS.USER_ACTIVITY, ({ userId, active, user: record }: Pick<OnlineUserRecord, "active"> & { userId: string; user?: OnlineUserRecord }) => {
      if (!this.users.get(userId) && record?._id === userId) this.users.set(userId, User.fromRecord({ ...record, active: false }));
      const user = this.users.get(userId);
      if (!user || user.active === active) return;
      user.active = active;
      Hooks.callAll("userConnected", user, active);
    });
    this.socket.on(SOCKET_EVENTS.SESSION_ENDED, () => this.lifecycle.onSessionEnded());
  }
}
