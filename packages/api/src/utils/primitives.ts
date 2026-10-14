/* Prototype extensions that Foundry installs globally; many add-ons call them directly. */

function defineMissing(target: object, name: string, value: unknown): void {
  if (Object.prototype.hasOwnProperty.call(target, name)) return;
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

function installStringExtensions(): void {
  defineMissing(String.prototype, "capitalize", function capitalize(this: string) {
    return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this.toString();
  });
  defineMissing(String.prototype, "titleCase", function titleCase(this: string) {
    return this.toLowerCase().split(" ").map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word)).join(" ");
  });
  defineMissing(String.prototype, "compare", function compare(this: string, other: string) {
    return this.localeCompare(other);
  });
  defineMissing(String.prototype, "stripScripts", function stripScripts(this: string) {
    return this.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  });
  defineMissing(String.prototype, "slugify", function slugify(this: string, { replacement = "-", strict = false } = {}) {
    let slug = this.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, replacement);
    if (strict) slug = slug.replace(new RegExp(`[^a-z0-9${replacement}]`, "g"), "");
    return slug;
  });
}

function installNumberExtensions(): void {
  defineMissing(Number, "isNumeric", (value: unknown) => {
    if (value instanceof Array) return false;
    if (typeof value === "number") return Number.isFinite(value);
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
  });
  defineMissing(Number, "fromString", (value: unknown) => {
    if (typeof value !== "string") return Number(value);
    return Number(value.replace(/\s/g, "").replace(/^\+/, ""));
  });
  defineMissing(Number.prototype, "almostEqual", function almostEqual(this: number, other: number, epsilon = 1e-8) {
    return Math.abs(this - other) < epsilon;
  });
  defineMissing(Number.prototype, "between", function between(this: number, low: number, high: number, inclusive = true) {
    return inclusive ? this >= low && this <= high : this > low && this < high;
  });
  defineMissing(Number.prototype, "ordinal", function ordinal(this: number) {
    const remainder = this % 100;
    if (remainder >= 11 && remainder <= 13) return `${this}th`;
    return `${this}${["th", "st", "nd", "rd"][this % 10] ?? "th"}`;
  });
  defineMissing(Number.prototype, "paddedString", function paddedString(this: number, digits: number) {
    return String(this).padStart(digits, "0");
  });
  defineMissing(Number.prototype, "signedString", function signedString(this: number) {
    return this < 0 ? `−${Math.abs(this)}` : `+${this}`;
  });
  defineMissing(Number.prototype, "toNearest", function toNearest(this: number, interval = 1, method: "round" | "ceil" | "floor" = "round") {
    if (interval < 0) throw new Error("Number#toNearest interval must be positive");
    return Math[method](this / interval) * interval;
  });
}

function installArrayExtensions(): void {
  defineMissing(Array, "fromRange", (length: number, start = 0) => Array.from({ length }, (_value, index) => index + start));
  defineMissing(Array.prototype, "deepFlatten", function deepFlatten(this: unknown[]) {
    return this.flat(Infinity);
  });
  defineMissing(Array.prototype, "equals", function equals(this: unknown[], other: unknown[]) {
    if (!(other instanceof Array) || other.length !== this.length) return false;
    return this.every((value, index) => {
      const otherValue = other[index];
      if (value instanceof Array && otherValue instanceof Array) return (value as any).equals(otherValue);
      return value === otherValue;
    });
  });
  defineMissing(Array.prototype, "partition", function partition<T>(this: T[], rule: (value: T) => boolean) {
    return this.reduce<[T[], T[]]>(
      (accumulator, value) => {
        accumulator[rule(value) ? 1 : 0].push(value);
        return accumulator;
      },
      [[], []],
    );
  });
  defineMissing(Array.prototype, "filterJoin", function filterJoin(this: unknown[], separator: string) {
    return this.filter((value) => !!value).join(separator);
  });
  defineMissing(Array.prototype, "findSplice", function findSplice<T>(this: T[], predicate: (value: T) => boolean, replacement?: T) {
    const index = this.findIndex(predicate);
    if (index === -1) return null;
    const [removed] = replacement !== undefined ? this.splice(index, 1, replacement) : this.splice(index, 1);
    return removed;
  });
}

function installMathExtensions(): void {
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);
  defineMissing(Math, "clamp", clamp);
  defineMissing(Math, "clamped", clamp);
  defineMissing(Math, "mix", (first: number, second: number, weight: number) => first * (1 - weight) + second * weight);
  defineMissing(Math, "toDegrees", (radians: number) => radians * (180 / Math.PI));
  defineMissing(Math, "toRadians", (degrees: number) => degrees * (Math.PI / 180));
  defineMissing(Math, "normalizeDegrees", (degrees: number, base = 0) => {
    const normalized = ((degrees % 360) + 360) % 360;
    return base === 360 && normalized === 0 ? 360 : normalized;
  });
  defineMissing(Math, "normalizeRadians", (radians: number) => {
    const turn = Math.PI * 2;
    return ((((radians + Math.PI) % turn) + turn) % turn) - Math.PI;
  });
  defineMissing(Math, "roundDecimals", (value: number, places: number) => {
    const factor = 10 ** Math.trunc(places);
    return Math.round(value * factor) / factor;
  });
}

function installSetExtensions(): void {
  defineMissing(Set.prototype, "equals", function equals(this: Set<unknown>, other: Set<unknown>) {
    return other instanceof Set && this.size === other.size && Array.from(this).every((value) => other.has(value));
  });
  defineMissing(Set.prototype, "first", function first(this: Set<unknown>) {
    return this.values().next().value;
  });
  defineMissing(Set.prototype, "isSubset", function isSubset(this: Set<unknown>, other: Set<unknown>) {
    return Array.from(this).every((value) => other.has(value));
  });
  defineMissing(Set.prototype, "toObject", function toObject(this: Set<unknown>) {
    return Array.from(this).map((value) => (typeof (value as any)?.toObject === "function" ? (value as any).toObject() : value));
  });
  installSetIterationExtensions();
}

type SetPredicate = (value: unknown, index: number, set: Set<unknown>) => unknown;

function installSetIterationExtensions(): void {
  defineMissing(Set.prototype, "intersects", function intersects(this: Set<unknown>, other: Set<unknown>) {
    for (const value of this) if (other.has(value)) return true;
    return false;
  });
  defineMissing(Set.prototype, "every", function every(this: Set<unknown>, test: SetPredicate) {
    let index = 0;
    for (const value of this) if (!test(value, index++, this)) return false;
    return true;
  });
  defineMissing(Set.prototype, "some", function some(this: Set<unknown>, test: SetPredicate) {
    let index = 0;
    for (const value of this) if (test(value, index++, this)) return true;
    return false;
  });
  defineMissing(Set.prototype, "find", function find(this: Set<unknown>, test: SetPredicate) {
    let index = 0;
    for (const value of this) if (test(value, index++, this)) return value;
    return undefined;
  });
  defineMissing(Set.prototype, "filter", function filter(this: Set<unknown>, test: SetPredicate) {
    const result = new Set<unknown>();
    let index = 0;
    for (const value of this) if (test(value, index++, this)) result.add(value);
    return result;
  });
  defineMissing(Set.prototype, "map", function map(this: Set<unknown>, transform: SetPredicate) {
    const result: unknown[] = [];
    let index = 0;
    for (const value of this) result.push(transform(value, index++, this));
    return result;
  });
  defineMissing(Set.prototype, "reduce", function reduce(this: Set<unknown>, reducer: (accumulator: unknown, value: unknown, index: number, set: Set<unknown>) => unknown, initial: unknown) {
    let accumulator = initial;
    let index = 0;
    for (const value of this) accumulator = reducer(accumulator, value, index++, this);
    return accumulator;
  });
}

function installRegExpExtensions(): void {
  defineMissing(RegExp, "escape", (value: string) => value.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&"));
}

export function installPrimitiveExtensions(): void {
  installStringExtensions();
  installNumberExtensions();
  installArrayExtensions();
  installMathExtensions();
  installSetExtensions();
  installRegExpExtensions();
}
