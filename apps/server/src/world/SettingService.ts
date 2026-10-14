import { MAX_SETTING_VALUE_BYTES, type ModifySettingRequest, type SettingRecord } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { generateDocumentId } from "./documentIds";
import type { DocumentCollectionStore, StoredDocument } from "./WorldDatabase";

type SettingDocument = SettingRecord & StoredDocument;

export interface SettingActor {
  userId: string;
  isGameMaster: boolean;
}

function indexKeyFor(key: string, userId: string | null): string {
  return `${userId ?? "world"}::${key}`;
}

export class SettingService {
  readonly #settingsByIndexKey = new Map<string, SettingDocument>();

  constructor(private readonly store: DocumentCollectionStore<SettingDocument>) {}

  async load(): Promise<void> {
    this.#settingsByIndexKey.clear();
    for (const setting of await this.store.getAll()) {
      this.#settingsByIndexKey.set(indexKeyFor(setting.key, setting.user), setting);
    }
  }

  listVisibleTo(userId: string): SettingRecord[] {
    return Array.from(this.#settingsByIndexKey.values()).filter((setting) => setting.user === null || setting.user === userId);
  }

  readWorldValue<TValue>(key: string): TValue | undefined {
    const setting = this.#settingsByIndexKey.get(indexKeyFor(key, null));
    if (!setting) return undefined;
    try {
      return JSON.parse(setting.value) as TValue;
    } catch {
      return undefined;
    }
  }

  async applyModification(request: ModifySettingRequest, actor: SettingActor): Promise<SettingRecord> {
    if (request.scope === "world" && !actor.isGameMaster) throw HttpError.forbidden();
    if (Buffer.byteLength(request.value, "utf8") > MAX_SETTING_VALUE_BYTES) throw HttpError.badRequest("Valor grande demais");
    try {
      JSON.parse(request.value);
    } catch {
      throw HttpError.badRequest("Valor precisa ser JSON");
    }

    const ownerUserId = request.scope === "user" ? actor.userId : null;
    const indexKey = indexKeyFor(request.key, ownerUserId);
    const existing = this.#settingsByIndexKey.get(indexKey);
    const setting: SettingDocument = {
      _id: existing?._id ?? generateDocumentId(),
      key: request.key,
      value: request.value,
      user: ownerUserId,
    };
    await this.store.put(setting);
    this.#settingsByIndexKey.set(indexKey, setting);
    return setting;
  }
}
