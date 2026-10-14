/* Faithful re-implementations of foundry.utils object helpers; add-ons depend on their exact semantics. */

export type PlainObject = Record<string, any>;

export interface MergeObjectOptions {
  insertKeys?: boolean;
  insertValues?: boolean;
  overwrite?: boolean;
  recursive?: boolean;
  inplace?: boolean;
  enforceTypes?: boolean;
  performDeletions?: boolean;
}

const MAX_EXPANSION_DEPTH = 32;

export function getType(variable: unknown): string {
  if (variable === null) return "null";
  const typeOfVariable = typeof variable;
  if (typeOfVariable !== "object") return typeOfVariable;

  const prototypeChecks: Array<[Function, string]> = [
    [Array, "Array"],
    [Set, "Set"],
    [Map, "Map"],
    [Promise, "Promise"],
    [Error, "Error"],
  ];
  const htmlElementConstructor = (globalThis as { HTMLElement?: Function }).HTMLElement;
  if (htmlElementConstructor) prototypeChecks.push([htmlElementConstructor, "HTMLElement"]);
  for (const [constructor, typeName] of prototypeChecks) {
    if (variable instanceof (constructor as new (...args: any[]) => unknown)) return typeName;
  }
  return "Object";
}

export function isEmpty(value: unknown): boolean {
  switch (getType(value)) {
    case "undefined":
    case "null":
      return true;
    case "Array":
      return (value as unknown[]).length === 0;
    case "Object":
      return Object.keys(value as object).length === 0;
    case "Set":
    case "Map":
      return (value as Set<unknown>).size === 0;
    default:
      return false;
  }
}

export function deepClone<T>(original: T, { strict = false }: { strict?: boolean } = {}, depth = 0): T {
  if (depth > 100) throw new Error("Maximum depth exceeded. Be sure your object does not contain cyclical data structures.");
  if (typeof original !== "object" || original === null) return original;
  if (Array.isArray(original)) return original.map((item) => deepClone(item, { strict }, depth + 1)) as T;
  if (original instanceof Date) return new Date(original) as T;

  const prototype = Object.getPrototypeOf(original);
  if (prototype === Object.prototype || prototype === null) {
    const clone: PlainObject = {};
    for (const key of Object.keys(original)) if (!isUnsafeObjectKey(key)) clone[key] = deepClone((original as PlainObject)[key], { strict }, depth + 1);
    return clone as T;
  }
  if (strict) throw new Error("deepClone cannot clone advanced objects");
  return original;
}

export function getProperty(object: unknown, key: string): any {
  if (!object || !key) return undefined;
  if (typeof object === "object" && key in (object as object)) return (object as PlainObject)[key];
  let target: any = object;
  for (const part of key.split(".")) {
    if (target === null || target === undefined) return undefined;
    const targetType = typeof target;
    if (targetType !== "object" && targetType !== "function") return undefined;
    if (!(part in target)) return undefined;
    target = target[part];
  }
  return target;
}

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isUnsafeObjectKey(key: string): boolean {
  return UNSAFE_OBJECT_KEYS.has(key.startsWith("-=") ? key.slice(2) : key);
}

export function setProperty(object: PlainObject, key: string, value: unknown): boolean {
  let target: PlainObject = object;
  let finalKey = key;
  if (key.split(".").some(isUnsafeObjectKey)) return false;
  if (key.includes(".")) {
    const parts = key.split(".");
    finalKey = parts.pop() as string;
    target = parts.reduce<PlainObject>((current, part) => {
      if (!Object.prototype.hasOwnProperty.call(current, part)) current[part] = {};
      return current[part];
    }, object);
  }
  if (!(finalKey in target) || target[finalKey] !== value) {
    target[finalKey] = value;
    return true;
  }
  return false;
}

export function hasProperty(object: unknown, key: string): boolean {
  if (!key || !object || typeof object !== "object") return false;
  if (key in object) return true;
  let target: any = object;
  for (const part of key.split(".")) {
    if (!target || typeof target !== "object") return false;
    if (!(part in target)) return false;
    target = target[part];
  }
  return true;
}

export function expandObject(object: PlainObject): PlainObject {
  const expandValue = (value: unknown, depth: number): unknown => {
    if (depth > MAX_EXPANSION_DEPTH) throw new Error("Maximum object expansion depth exceeded");
    if (Array.isArray(value)) return value.map((item) => expandValue(item, depth + 1));
    if (getType(value) !== "Object") return value;
    const expanded: PlainObject = {};
    for (const [entryKey, entryValue] of Object.entries(value as PlainObject)) {
      setProperty(expanded, entryKey, expandValue(entryValue, depth + 1));
    }
    return expanded;
  };
  return expandValue(object, 0) as PlainObject;
}

export function flattenObject(object: PlainObject, depth = 0): PlainObject {
  if (depth > 100) throw new Error("Maximum depth exceeded");
  const flattened: PlainObject = {};
  for (const [key, value] of Object.entries(object)) {
    if (getType(value) === "Object" && !isEmpty(value)) {
      for (const [innerKey, innerValue] of Object.entries(flattenObject(value, depth + 1))) {
        flattened[`${key}.${innerKey}`] = innerValue;
      }
    } else {
      flattened[key] = value;
    }
  }
  return flattened;
}

function mergeInsert(original: PlainObject, key: string, value: unknown, options: MergeObjectOptions, depth: number): void {
  if (key.startsWith("-=") && options.performDeletions) {
    delete original[key.slice(2)];
    return;
  }
  const canInsert = (depth <= 1 && options.insertKeys) || (depth > 1 && options.insertValues);
  if (!canInsert) return;
  if ((value as PlainObject | null)?.constructor === Object) {
    original[key] = mergeObject({}, value as PlainObject, { insertKeys: true, inplace: true, performDeletions: options.performDeletions });
    return;
  }
  original[key] = value;
}

function mergeUpdate(original: PlainObject, key: string, value: unknown, options: MergeObjectOptions, depth: number): void {
  const existing = original[key];
  const valueType = getType(value);
  const existingType = getType(existing);
  if (existingType === "Object" && valueType === "Object" && options.recursive) {
    mergeObject(existing, value as PlainObject, { ...options, inplace: true }, depth);
    return;
  }
  if (!options.overwrite) return;
  if (existingType !== "undefined" && valueType !== existingType && options.enforceTypes) {
    throw new Error("Mismatched data types encountered during object merge.");
  }
  original[key] = value;
}

export function mergeObject<T extends PlainObject>(
  original: T,
  other: PlainObject = {},
  {
    insertKeys = true,
    insertValues = true,
    overwrite = true,
    recursive = true,
    inplace = true,
    enforceTypes = false,
    performDeletions = false,
  }: MergeObjectOptions = {},
  depth = 0,
): T {
  other = other || {};
  if (!(original instanceof Object) || !(other instanceof Object)) throw new Error("One of original or other are not Objects!");
  const options: MergeObjectOptions = { insertKeys, insertValues, overwrite, recursive, inplace, enforceTypes, performDeletions };

  let target: PlainObject = original;
  if (!inplace && depth === 0) target = deepClone(original);
  if (Object.keys(target).some((key) => key.includes("."))) target = expandObject(target);
  if (Object.keys(other).some((key) => key.includes("."))) other = expandObject(other);

  for (const key of Object.keys(other)) {
    if (isUnsafeObjectKey(key)) continue;
    if (Object.prototype.hasOwnProperty.call(target, key)) mergeUpdate(target, key, other[key], options, depth + 1);
    else mergeInsert(target, key, other[key], options, depth + 1);
  }
  return target as T;
}

function arraysEqual(left: unknown[], right: unknown[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => objectsEqual(item, right[index]));
}

export function objectsEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const leftType = getType(left);
  if (leftType !== getType(right)) return false;
  if (leftType === "Array") return arraysEqual(left as unknown[], right as unknown[]);
  if (leftType !== "Object") return false;
  const leftKeys = Object.keys(left as object);
  if (leftKeys.length !== Object.keys(right as object).length) return false;
  return leftKeys.every((key) => objectsEqual((left as PlainObject)[key], (right as PlainObject)[key]));
}

export function diffObject(original: PlainObject, other: PlainObject, { inner = false, deletionKeys = false } = {}): PlainObject {
  const difference = (originalValue: unknown, otherValue: unknown): [boolean, unknown] => {
    const originalType = getType(originalValue);
    const otherType = getType(otherValue);
    if (originalType !== otherType) return [true, otherValue];
    if (originalType === "Array") return [!arraysEqual(originalValue as unknown[], otherValue as unknown[]), otherValue];
    if (originalType === "Object") {
      if (isEmpty(originalValue) !== isEmpty(otherValue)) return [true, otherValue];
      const nested = diffObject(originalValue as PlainObject, otherValue as PlainObject, { inner, deletionKeys });
      return [!isEmpty(nested), nested];
    }
    return [originalValue !== otherValue, otherValue];
  };

  const result: PlainObject = {};
  for (const key of Object.keys(other)) {
    if (deletionKeys && key.startsWith("-=")) {
      result[key] = other[key];
      continue;
    }
    if (inner && !(key in original)) continue;
    const [isDifferent, value] = difference(original[key], other[key]);
    if (isDifferent) result[key] = value;
  }
  return result;
}

export function filterObject(source: PlainObject, template: PlainObject, { deletionKeys = false, templateValues = false } = {}): PlainObject {
  const filtered: PlainObject = {};
  for (const [key, value] of Object.entries(source)) {
    const existsInTemplate = Object.prototype.hasOwnProperty.call(template, key);
    const templateValue = template[key];
    if (existsInTemplate) {
      if (getType(value) === "Object" && getType(templateValue) === "Object") {
        filtered[key] = filterObject(value, templateValue, { deletionKeys, templateValues });
      } else {
        filtered[key] = templateValues && getType(templateValue) !== "Object" ? templateValue : value;
      }
    } else if (deletionKeys && key.startsWith("-=")) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function invertObject(object: PlainObject): PlainObject {
  const inverted: PlainObject = {};
  for (const [key, value] of Object.entries(object)) {
    if (value in inverted) throw new Error("The values of the provided object must be unique in order to invert it.");
    inverted[value] = key;
  }
  return inverted;
}

export function duplicate<T>(original: T): T {
  return JSON.parse(JSON.stringify(original));
}
