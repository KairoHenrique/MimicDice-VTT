import type { BanRecord } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { generateDocumentId } from "./documentIds";
import type { DocumentCollectionStore, StoredDocument } from "./WorldDatabase";

const MAX_BANS_PER_WORLD = 200;
const MAX_DEVICES_PER_BAN = 10;

export interface BanDocument extends StoredDocument {
  name: string;
  nameKey: string;
  /** Keyed hashes from `DeviceFingerprinter`, never raw addresses. */
  deviceKeys: string[];
  bannedAt: number;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/** Players the GM banned from this world, matched by name or by any device they were using. */
export class BanService {
  readonly #bansById = new Map<string, BanDocument>();
  readonly #banIdByName = new Map<string, string>();
  readonly #banIdByDevice = new Map<string, string>();

  constructor(private readonly store: DocumentCollectionStore<BanDocument>) {}

  async load(): Promise<void> {
    this.#bansById.clear();
    this.#banIdByName.clear();
    this.#banIdByDevice.clear();
    for (const ban of await this.store.getAll()) this.#index(ban);
  }

  list(): BanRecord[] {
    return Array.from(this.#bansById.values(), ({ _id, name, bannedAt }) => ({ _id, name, bannedAt })).sort((left, right) => right.bannedAt - left.bannedAt);
  }

  isBanned(name: string, deviceKey: string | null): boolean {
    if (this.#banIdByName.has(normalizeName(name))) return true;
    return deviceKey !== null && this.#banIdByDevice.has(deviceKey);
  }

  isDeviceBanned(deviceKey: string | null): boolean {
    return deviceKey !== null && this.#banIdByDevice.has(deviceKey);
  }

  async ban(name: string, deviceKeys: readonly string[]): Promise<BanRecord> {
    const nameKey = normalizeName(name);
    const existingId = this.#banIdByName.get(nameKey);
    const existing = existingId ? this.#bansById.get(existingId) : undefined;
    if (!existing && this.#bansById.size >= MAX_BANS_PER_WORLD) throw HttpError.conflict("Lista de banidos cheia. Desbana alguém antes.");
    const mergedDevices = Array.from(new Set([...(existing?.deviceKeys ?? []), ...deviceKeys])).slice(-MAX_DEVICES_PER_BAN);
    const ban: BanDocument = { _id: existing?._id ?? generateDocumentId(), name: name.trim(), nameKey, deviceKeys: mergedDevices, bannedAt: Date.now() };
    await this.store.put(ban);
    if (existing) this.#unindex(existing);
    this.#index(ban);
    return { _id: ban._id, name: ban.name, bannedAt: ban.bannedAt };
  }

  async unban(banId: string): Promise<void> {
    const ban = this.#bansById.get(banId);
    if (!ban) throw HttpError.notFound("Banimento não encontrado");
    await this.store.delete(banId);
    this.#unindex(ban);
  }

  #index(ban: BanDocument): void {
    this.#bansById.set(ban._id, ban);
    this.#banIdByName.set(ban.nameKey, ban._id);
    for (const deviceKey of ban.deviceKeys) this.#banIdByDevice.set(deviceKey, ban._id);
  }

  #unindex(ban: BanDocument): void {
    this.#bansById.delete(ban._id);
    this.#banIdByName.delete(ban.nameKey);
    for (const deviceKey of ban.deviceKeys) {
      if (this.#banIdByDevice.get(deviceKey) === ban._id) this.#banIdByDevice.delete(deviceKey);
    }
  }
}
