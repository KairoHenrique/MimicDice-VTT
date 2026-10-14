export class PresenceTracker {
  readonly #connectionCountByUserId = new Map<string, number>();

  isActive(userId: string): boolean {
    return (this.#connectionCountByUserId.get(userId) ?? 0) > 0;
  }

  registerConnection(userId: string): boolean {
    const previousCount = this.#connectionCountByUserId.get(userId) ?? 0;
    this.#connectionCountByUserId.set(userId, previousCount + 1);
    return previousCount === 0;
  }

  releaseConnection(userId: string): boolean {
    const remainingCount = (this.#connectionCountByUserId.get(userId) ?? 1) - 1;
    if (remainingCount > 0) {
      this.#connectionCountByUserId.set(userId, remainingCount);
      return false;
    }
    this.#connectionCountByUserId.delete(userId);
    return true;
  }
}
