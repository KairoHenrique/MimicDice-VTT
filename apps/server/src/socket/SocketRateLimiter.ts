/** Token bucket per socket: allows short bursts while capping sustained request rate. */
export class SocketRateLimiter {
  #tokens: number;
  #lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.#tokens = capacity;
  }

  tryConsume(): boolean {
    const now = Date.now();
    this.#tokens = Math.min(this.capacity, this.#tokens + ((now - this.#lastRefill) / 1000) * this.refillPerSecond);
    this.#lastRefill = now;
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
