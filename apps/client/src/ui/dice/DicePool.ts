export const MAX_POOLED_DICE = 20;

/** How the queued dice turn into a result: add them all, or keep only the highest or the lowest die. */
export type DicePoolMode = "sum" | "highest" | "lowest";

const KEEP_MODIFIERS: Record<Exclude<DicePoolMode, "sum">, string> = { highest: "kh", lowest: "kl" };

/** Dice the player has queued by clicking die buttons; rolled together as a single formula. */
export class DicePool {
  readonly #counts = new Map<number, number>();
  mode: DicePoolMode = "sum";

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

  /** e.g. "2d20 + 1d6" when adding, "2d20kh" or "{1d20,1d6}kl" when keeping one die; largest dice first. */
  toFormula(): string {
    const groups = [...this.#counts.entries()].sort(([leftFaces], [rightFaces]) => rightFaces - leftFaces);
    if (this.mode === "sum" || this.total < 2) return groups.map(([faces, count]) => `${count}d${faces}`).join(" + ");
    const keep = KEEP_MODIFIERS[this.mode];
    if (groups.length === 1) return `${groups[0]![1]}d${groups[0]![0]}${keep}`;
    const singleDice = groups.flatMap(([faces, count]) => Array.from({ length: count }, () => `1d${faces}`));
    return `{${singleDice.join(",")}}${keep}`;
  }
}
