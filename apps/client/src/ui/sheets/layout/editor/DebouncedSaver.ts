/** Batches rapid edits into one persisted write and serializes writes so they land in order. */
export class DebouncedSaver<T> {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #pending: Promise<void> = Promise.resolve();
  #revision = 0;
  #savedRevision = 0;
  #latest: T | null = null;

  constructor(
    private readonly persist: (value: T) => Promise<void>,
    private readonly delayMs: number,
    private readonly onError: (error: Error) => void,
  ) {}

  get isClean(): boolean {
    return this.#timer === null && this.#revision === this.#savedRevision;
  }

  schedule(value: T): void {
    this.#latest = value;
    this.#revision += 1;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#write(), this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.#timer !== null) this.#write();
    await this.#pending;
  }

  #write(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    const revision = this.#revision;
    const value = this.#latest as T;
    this.#pending = this.#pending
      .then(() => this.persist(value))
      .then(() => {
        this.#savedRevision = Math.max(this.#savedRevision, revision);
      })
      .catch((error: Error) => this.onError(error));
  }
}
