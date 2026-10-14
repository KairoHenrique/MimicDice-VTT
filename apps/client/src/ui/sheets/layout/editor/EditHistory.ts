/** Bounded undo/redo stack of immutable snapshots. */
export class EditHistory<T> {
  readonly #past: T[] = [];
  readonly #future: T[] = [];

  constructor(private readonly limit = 50) {}

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  record(previous: T): void {
    this.#past.push(previous);
    if (this.#past.length > this.limit) this.#past.shift();
    this.#future.length = 0;
  }

  undo(current: T): T | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(current);
    return previous;
  }

  redo(current: T): T | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(current);
    return next;
  }
}
