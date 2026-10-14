import path from "node:path";
import { ClassicLevel } from "classic-level";

export const WORLD_COLLECTION_NAMES = [
  "users",
  "settings",
  "actors",
  "items",
  "scenes",
  "journal",
  "messages",
  "combats",
  "folders",
  "macros",
  "playlists",
  "tables",
  "cards",
] as const;

export type WorldCollectionName = (typeof WORLD_COLLECTION_NAMES)[number];

export interface StoredDocument {
  _id: string;
}

type DocumentLevel<TDocument> = ClassicLevel<string, TDocument>;

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "LEVEL_NOT_FOUND";
}

export class DocumentCollectionStore<TDocument extends StoredDocument> {
  readonly #keyPrefix: string;

  constructor(
    collectionName: WorldCollectionName,
    private readonly level: DocumentLevel<TDocument>,
  ) {
    this.#keyPrefix = `!${collectionName}!`;
  }

  async get(documentId: string): Promise<TDocument | undefined> {
    try {
      return (await this.level.get(this.#keyPrefix + documentId)) ?? undefined;
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw error;
    }
  }

  async getAll(): Promise<TDocument[]> {
    const documents: TDocument[] = [];
    const range = { gte: this.#keyPrefix, lt: `${this.#keyPrefix}\xff` };
    for await (const document of this.level.values(range)) documents.push(document);
    return documents;
  }

  async put(document: TDocument): Promise<void> {
    await this.level.put(this.#keyPrefix + document._id, document);
  }

  async delete(documentId: string): Promise<void> {
    await this.level.del(this.#keyPrefix + documentId);
  }
}

export class WorldDatabase {
  readonly #openLevels = new Map<WorldCollectionName, Promise<DocumentLevel<StoredDocument>>>();

  constructor(private readonly worldDataDirectory: string) {}

  async collection<TDocument extends StoredDocument>(name: WorldCollectionName): Promise<DocumentCollectionStore<TDocument>> {
    const level = (await this.#openLevel(name)) as unknown as DocumentLevel<TDocument>;
    return new DocumentCollectionStore<TDocument>(name, level);
  }

  async close(): Promise<void> {
    const levels = await Promise.all(this.#openLevels.values());
    this.#openLevels.clear();
    await Promise.all(levels.map((level) => level.close()));
  }

  #openLevel(name: WorldCollectionName): Promise<DocumentLevel<StoredDocument>> {
    let pendingLevel = this.#openLevels.get(name);
    if (!pendingLevel) {
      pendingLevel = (async () => {
        const level = new ClassicLevel<string, StoredDocument>(path.join(this.worldDataDirectory, name), {
          valueEncoding: "json",
        });
        await level.open();
        return level;
      })();
      this.#openLevels.set(name, pendingLevel);
    }
    return pendingLevel;
  }
}
