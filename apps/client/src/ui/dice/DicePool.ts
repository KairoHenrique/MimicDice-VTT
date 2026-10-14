export const MAX_POOLED_DICE = 20;

/** Dice the player has queued by clicking die buttons; rolled together as a single formula. */
export class DicePool {
  readonly #counts = new Map<number, number>();

  get total(): number {
    let total = 0;
    for (const count of this.#counts.values()) total += count;
    return total;
  }

  get isEmpty(): boolean {
    return this.#counts.size === 0;
  }

  get isFull(): boolean {
    return this.total >= MAX_POOLED_DICE;
  }

  countOf(faces: number): number {
    return this.#counts.get(faces) ?? 0;
  }

  /** Returns false when the pool already holds the maximum number of dice. */
  add(faces: number): boolean {
    if (!Number.isInteger(faces) || faces < 2 || this.isFull) return false;
    this.#counts.set(faces, this.countOf(faces) + 1);
    return true;
  }

  remove(faces: number): void {
    const remaining = this.countOf(faces) - 1;
    if (remaining > 0) this.#counts.set(faces, remaining);
    else this.#counts.delete(faces);
  }

  clear(): void {
    this.#counts.clear();
  }

  /** e.g. "2d20 + 1d6", largest dice first. */
  toFormula(): string {
    return [...this.#counts.entries()]
      .sort(([leftFaces], [rightFaces]) => rightFaces - leftFaces)
      .map(([faces, count]) => `${count}d${faces}`)
      .join(" + ");
  }
}
