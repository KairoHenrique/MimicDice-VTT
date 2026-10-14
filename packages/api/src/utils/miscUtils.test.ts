import { describe, expect, it } from "vitest";
import { Collection } from "./Collection";
import { isNewerVersion } from "./miscUtils";

describe("isNewerVersion", () => {
  it("compares dotted versions numerically", () => {
    expect(isNewerVersion("13.351", "12")).toBe(true);
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("12", "13.0")).toBe(false);
  });
});

describe("Collection", () => {
  it("iterates over values like Foundry's Collection", () => {
    const collection = new Collection<{ name: string }>([
      ["a", { name: "Alpha" }],
      ["b", { name: "Beta" }],
    ]);
    expect(Array.from(collection as Iterable<{ name: string }>).map((entry) => entry.name)).toEqual(["Alpha", "Beta"]);
    expect(collection.getName("Beta")).toEqual({ name: "Beta" });
    expect(() => collection.get("missing", { strict: true })).toThrow();
  });
});
