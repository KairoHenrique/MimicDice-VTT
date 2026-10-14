const MAXIMUM_STATES = 32;

/** A named set of up to 32 boolean flags packed into one integer (shaders read it as a `uint`). */
export class BitMask {
  readonly #positions = new Map<string, number>();
  #value = 0;

  constructor(states: Record<string, boolean> | null = null) {
    if (!states) return;
    const names = Object.keys(states);
    if (names.length > MAXIMUM_STATES) throw new RangeError(`BitMask supports at most ${MAXIMUM_STATES} states.`);
    names.forEach((name, position) => {
      this.#positions.set(name, position);
      if (states[name]) this.#value |= 1 << position;
    });
  }

  get states(): Record<string, boolean> {
    return Object.fromEntries([...this.#positions].map(([name, position]) => [name, (this.#value & (1 << position)) !== 0]));
  }

  get isEmpty(): boolean {
    return this.#value === 0;
  }

  #bitOf(name: string): number {
    const position = this.#positions.get(name);
    if (position === undefined) throw new Error(`BitMask has no state named "${name}".`);
    return 1 << position;
  }

  hasState(name: string): boolean {
    return (this.#value & this.#bitOf(name)) !== 0;
  }

  addState(name: string): void {
    this.#value |= this.#bitOf(name);
  }

  removeState(name: string): void {
    this.#value &= ~this.#bitOf(name);
  }

  toggleState(name: string, enabled: boolean = !this.hasState(name)): void {
    if (enabled) this.addState(name);
    else this.removeState(name);
  }

  clear(): void {
    this.#value = 0;
  }

  valueOf(): number {
    return this.#value >>> 0;
  }

  toString(): string {
    return this.valueOf().toString(2).padStart(this.#positions.size, "0");
  }

  toJSON(): Record<string, boolean> {
    return this.states;
  }

  clone(): BitMask {
    return new BitMask(this.states);
  }

  /** GLSL `const uint` declarations, one per state, matching the bit positions of a mask built with the same names. */
  static generateShaderBitMaskConstants(names: readonly string[]): string {
    if (names.length > MAXIMUM_STATES) throw new RangeError(`BitMask supports at most ${MAXIMUM_STATES} states.`);
    return names.map((name, position) => `const uint ${String(name).toUpperCase().replace(/[^A-Z0-9_]/g, "_")} = 0x${(1 << position >>> 0).toString(16).toUpperCase()}U;`).join("\n");
  }
}
