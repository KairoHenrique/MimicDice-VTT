import { describe, expect, it } from "vitest";
import { diffObject, expandObject, flattenObject, getProperty, mergeObject, setProperty } from "./objectUtils";

describe("mergeObject", () => {
  it("inserts class instances by reference instead of copying them into plain objects", () => {
    class Component {
      greet(): string {
        return "hi";
      }
    }
    const component = new Component();
    const result = mergeObject<Record<string, unknown>>({}, { strength: component });
    expect(result.strength).toBe(component);
  });

  it("merges nested objects in place by default", () => {
    const original = { a: 1, nested: { b: 2 } };
    const result = mergeObject(original, { nested: { c: 3 } });
    expect(result).toBe(original);
    expect(original).toEqual({ a: 1, nested: { b: 2, c: 3 } });
  });

  it("does not mutate the original when inplace is false", () => {
    const original = { nested: { b: 2 } };
    const result = mergeObject(original, { nested: { b: 5 } }, { inplace: false });
    expect(original.nested.b).toBe(2);
    expect(result.nested.b).toBe(5);
  });

  it("expands dotted keys", () => {
    expect(mergeObject({}, { "a.b.c": 1 })).toEqual({ a: { b: { c: 1 } } });
  });

  it("respects insertKeys and insertValues", () => {
    expect(mergeObject({ a: 1 }, { b: 2 }, { insertKeys: false })).toEqual({ a: 1 });
    expect(mergeObject({ a: { x: 1 } }, { a: { y: 2 } }, { insertValues: false })).toEqual({ a: { x: 1 } });
  });

  it("performs deletions with the -= prefix only when requested", () => {
    expect(mergeObject({ a: 1, b: 2 }, { "-=b": null }, { performDeletions: true })).toEqual({ a: 1 });
    expect(mergeObject({ a: 1, b: 2 }, { "-=b": null })).toEqual({ a: 1, b: 2, "-=b": null });
  });

  it("throws on mismatched types when enforceTypes is set", () => {
    expect(() => mergeObject({ a: 1 }, { a: "x" }, { enforceTypes: true })).toThrow();
  });
});

describe("property helpers", () => {
  it("reads and writes nested properties", () => {
    const target: Record<string, any> = {};
    expect(setProperty(target, "a.b", 3)).toBe(true);
    expect(setProperty(target, "a.b", 3)).toBe(false);
    expect(getProperty(target, "a.b")).toBe(3);
    expect(getProperty(target, "a.missing.deep")).toBeUndefined();
  });

  it("round-trips flatten and expand", () => {
    const nested = { a: { b: 1, c: { d: 2 } }, e: {} };
    expect(flattenObject(nested)).toEqual({ "a.b": 1, "a.c.d": 2, e: {} });
    expect(expandObject(flattenObject(nested))).toEqual(nested);
  });

  it("computes differences", () => {
    expect(diffObject({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toEqual({ b: { c: 3 } });
  });

  it("ignores prototype-polluting keys from untrusted payloads", () => {
    const payload = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}}');
    mergeObject({}, payload);
    setProperty({}, "__proto__.polluted", true);
    expandObject({ "constructor.prototype.polluted": true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
