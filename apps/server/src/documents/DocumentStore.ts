import type { DocumentSource } from "@tabbletop/protocol";
import type { Logger } from "../logging/logger";
import type { DocumentCollectionStore } from "../world/WorldDatabase";

/**
 * In-memory index of one world collection. Mutations happen synchronously in memory (so concurrent socket
 * requests never interleave a read-modify-write) and are persisted through a single ordered write queue.
 */
export class DocumentStore {
  readonly #documentsById = new Map<string, DocumentSource>();
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(
    readonly collectionName: string,
    private readonly persistence: DocumentCollectionStore<DocumentSource>,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    this.#documentsById.clear();
    for (const document of await this.persistence.getAll()) this.#documentsById.set(document._id, document);
  }

  get(documentId: string): DocumentSource | undefined {
    return this.#documentsById.get(documentId);
  }

  has(documentId: string): boolean {
    return this.#documentsById.has(documentId);
  }

  values(): IterableIterator<DocumentSource> {
    return this.#documentsById.values();
  }

  set(document: DocumentSource): Promise<void> {
    this.#documentsById.set(document._id, document);
    return this.#enqueue(() => this.persistence.put(document));
  }

  remove(documentId: string): Promise<void> {
    this.#documentsById.delete(documentId);
    return this.#enqueue(() => this.persistence.delete(documentId));
  }

  /** Resolves once every write queued so far has reached disk. */
  flush(): Promise<void> {
    return this.#writeQueue;
  }

  #enqueue(write: () => Promise<void>): Promise<void> {
    const pendingWrite = this.#writeQueue.then(write);
    this.#writeQueue = pendingWrite.catch((error) => {
      this.logger.error("Falha ao gravar documento", error, { collection: this.collectionName });
    });
    return pendingWrite;
  }
}
