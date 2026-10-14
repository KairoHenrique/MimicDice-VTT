const CHECK_INTERVAL_MS = 60 * 1000;

export interface TableSessionIdleCloserOptions {
  idleLimitMs: number;
  isSessionOpen: () => boolean;
  closeSession: () => Promise<void>;
  onError: (error: unknown) => void;
  now?: () => number;
}

/** Closes the GM's game session once nobody has sent any input for `idleLimitMs`. */
export class TableSessionIdleCloser {
  readonly #options: TableSessionIdleCloserOptions;
  readonly #now: () => number;
  #lastActivityAt: number;
  #timer: NodeJS.Timeout | null = null;
  #closing = false;

  constructor(options: TableSessionIdleCloserOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#lastActivityAt = this.#now();
  }

  recordActivity(): void {
    this.#lastActivityAt = this.#now();
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.checkIdle(), CHECK_INTERVAL_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** Returns true when this check closed the session. */
  async checkIdle(): Promise<boolean> {
    if (this.#closing || !this.#options.isSessionOpen()) return false;
    if (this.#now() - this.#lastActivityAt < this.#options.idleLimitMs) return false;
    this.#closing = true;
    try {
      await this.#options.closeSession();
      return true;
    } catch (error) {
      this.#options.onError(error);
      return false;
    } finally {
      this.#closing = false;
    }
  }
}
