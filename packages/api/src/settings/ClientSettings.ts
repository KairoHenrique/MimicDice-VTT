import type { SettingRecord } from "@tabbletop/protocol";
import { deepClone, getType } from "@tabbletop/common";

export type SettingScope = "world" | "client" | "user";

export interface SettingConfig {
  key: string;
  namespace: string;
  id: string;
  name?: string;
  hint?: string;
  scope: SettingScope;
  config: boolean;
  type?: any;
  default?: unknown;
  choices?: Record<string, string>;
  range?: { min: number; max: number; step?: number };
  onChange?: (value: unknown, options?: object) => void;
  requiresReload?: boolean;
  restricted?: boolean;
  [extra: string]: unknown;
}

export interface SettingStorageBackend {
  persistRemote(key: string, scope: "world" | "user", serializedValue: string): Promise<SettingRecord>;
}

const PRIMITIVE_CASTS = new Map<unknown, (value: unknown) => unknown>([
  [String, (value) => (value === null || value === undefined ? value : String(value))],
  [Number, (value) => (value === null || value === undefined ? value : Number(value))],
  [Boolean, (value) => Boolean(value)],
  [Object, (value) => value],
  [Array, (value) => value],
]);

function castSettingValue(config: SettingConfig, rawValue: unknown): unknown {
  const settingType = config.type;
  if (!settingType || rawValue === undefined) return rawValue;
  const primitiveCast = PRIMITIVE_CASTS.get(settingType);
  if (primitiveCast) return primitiveCast(rawValue);
  if (typeof settingType === "function" && settingType.prototype) {
    if (rawValue instanceof settingType) return rawValue;
    try {
      return new settingType(rawValue);
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}

function serializeSettingValue(value: unknown): string {
  const serializable = value as { toJSON?: () => unknown } | null;
  return JSON.stringify(typeof serializable?.toJSON === "function" ? serializable.toJSON() : value ?? null);
}

export class ClientSettings {
  readonly settings = new Map<string, SettingConfig>();
  readonly menus = new Map<string, Record<string, unknown>>();
  readonly #remoteValues = new Map<string, string>();

  constructor(
    initialRecords: SettingRecord[],
    private readonly backend: SettingStorageBackend,
    private readonly localStore: Storage = globalThis.localStorage,
  ) {
    for (const record of initialRecords) this.#remoteValues.set(record.key, record.value);
  }

  get storage(): Map<string, unknown> {
    return new Map<string, unknown>([
      ["client", this.localStore],
      ["world", this.#remoteValues],
      ["user", this.#remoteValues],
    ]);
  }

  register(namespace: string, key: string, data: Partial<SettingConfig>): void {
    if (!namespace || !key) throw new Error("You must specify both namespace and key portions of the setting");
    const id = `${namespace}.${key}`;
    const config: SettingConfig = { scope: "client", config: false, ...data, key, namespace, id } as SettingConfig;
    if (!["world", "client", "user"].includes(config.scope)) throw new Error(`Invalid setting scope "${config.scope}" for ${id}`);
    if (config.type === undefined && config.default !== undefined) {
      const defaultType = getType(config.default);
      config.type = { string: String, number: Number, boolean: Boolean, Array, Object }[defaultType] ?? undefined;
    }
    this.settings.set(id, config);
  }

  registerMenu(namespace: string, key: string, data: Record<string, unknown>): void {
    if (!namespace || !key) throw new Error("You must specify both namespace and key portions of the menu");
    this.menus.set(`${namespace}.${key}`, { ...data, key, namespace });
  }

  get(namespace: string, key: string): any {
    const id = `${namespace}.${key}`;
    const config = this.settings.get(id);
    if (!config) throw new Error(`"${id}" is not a registered game setting`);
    const serialized = config.scope === "client" ? this.localStore.getItem(id) : this.#remoteValues.get(id);
    if (serialized === null || serialized === undefined) return castSettingValue(config, deepClone(config.default));
    try {
      return castSettingValue(config, JSON.parse(serialized));
    } catch {
      return castSettingValue(config, deepClone(config.default));
    }
  }

  async set(namespace: string, key: string, value: unknown, options: object = {}): Promise<unknown> {
    const id = `${namespace}.${key}`;
    const config = this.settings.get(id);
    if (!config) throw new Error(`"${id}" is not a registered game setting`);
    this.#assertValidChoice(config, value);
    const serialized = serializeSettingValue(value);

    if (config.scope === "client") {
      this.localStore.setItem(id, serialized);
      this.#notifyChange(config, options);
      return value;
    }
    const record = await this.backend.persistRemote(id, config.scope, serialized);
    this.applyRemoteRecord(record, options);
    return value;
  }

  applyRemoteRecord(record: SettingRecord, options: object = {}): void {
    if (this.#remoteValues.get(record.key) === record.value) return;
    this.#remoteValues.set(record.key, record.value);
    const config = this.settings.get(record.key);
    if (config) this.#notifyChange(config, options);
  }

  #assertValidChoice(config: SettingConfig, value: unknown): void {
    if (config.choices && !(String(value) in config.choices)) {
      throw new Error(`The value "${String(value)}" is not a valid choice for setting ${config.id}`);
    }
  }

  #notifyChange(config: SettingConfig, options: object): void {
    try {
      config.onChange?.(this.get(config.namespace, config.key), options);
    } catch (error) {
      console.error(`MimicDice | onChange failed for setting ${config.id}`, error);
    }
  }
}
