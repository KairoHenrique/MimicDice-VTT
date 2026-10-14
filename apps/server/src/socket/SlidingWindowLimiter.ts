/** At most `maxEvents` per key inside any rolling `windowMs`; shared by every socket of the same user. */
export class SlidingWindowLimiter {
  readonly #timestampsByKey = new Map<string, number[]>();

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryConsume(key: string): boolean {
    const now = this.now();
    const recent = (this.#timestampsByKey.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= this.maxEvents) {
      this.#timestampsByKey.set(key, recent);
      return false;
    }
    recent.push(now);
    this.#timestampsByKey.set(key, recent);
    return true;
  }

  forget(key: string): void {
    this.#timestampsByKey.delete(key);
  }
}
