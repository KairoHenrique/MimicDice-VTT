/** Map whose iterator yields values, matching foundry.utils.Collection. */
export class Collection<V = any> extends Map<string, V> {
  override [Symbol.iterator](): any {
    return this.values();
  }

  get contents(): V[] {
    return Array.from(this.values());
  }

  find(predicate: (value: V, index: number, collection: this) => unknown): V | undefined {
    let index = 0;
    for (const value of this.values()) {
      if (predicate(value, index, this)) return value;
      index += 1;
    }
    return undefined;
  }

  filter(predicate: (value: V, index: number, collection: this) => unknown): V[] {
    const matches: V[] = [];
    let index = 0;
    for (const value of this.values()) {
      if (predicate(value, index, this)) matches.push(value);
      index += 1;
    }
    return matches;
  }

  map<R>(transform: (value: V, index: number, collection: this) => R): R[] {
    const results: R[] = [];
    let index = 0;
    for (const value of this.values()) results.push(transform(value, index++, this));
    return results;
  }

  reduce<R>(reducer: (accumulator: R, value: V, index: number, collection: this) => R, initial: R): R {
    let accumulator = initial;
    let index = 0;
    for (const value of this.values()) accumulator = reducer(accumulator, value, index++, this);
    return accumulator;
  }

  some(predicate: (value: V, index: number, collection: this) => unknown): boolean {
    return this.find(predicate) !== undefined;
  }

  every(predicate: (value: V, index: number, collection: this) => unknown): boolean {
    let index = 0;
    for (const value of this.values()) {
      if (!predicate(value, index++, this)) return false;
    }
    return true;
  }

  override get(key: string, { strict = false }: { strict?: boolean } = {}): V | undefined {
    const value = super.get(key);
    if (strict && value === undefined) throw new Error(`The key ${key} does not exist in the ${this.constructor.name} Collection`);
    return value;
  }

  getName(name: string, { strict = false }: { strict?: boolean } = {}): V | undefined {
    const value = this.find((candidate) => (candidate as { name?: string }).name === name);
    if (strict && value === undefined) throw new Error(`An entry with name ${name} does not exist in the collection`);
    return value;
  }

  toJSON(): unknown[] {
    return this.map((value) => {
      const serializable = value as { toJSON?: () => unknown };
      return typeof serializable?.toJSON === "function" ? serializable.toJSON() : value;
    });
  }
}
