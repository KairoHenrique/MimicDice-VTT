import { describe, expect, it } from "vitest";
import { CHEST_FLAG, chestCapacity, isChestFull, MAX_CHEST_ENTRIES, newChestEntryId, readChest, visibleChestEntries, type ChestEntry } from "./chests";
import { PERCEPTION_DC_FLAG } from "./concealment";

const entry = (id: string, perceptionDc: number | null, revealed = false): ChestEntry => ({ id, perceptionDc, revealed, item: { name: `Item ${id}`, type: "item", img: "", system: {}, flags: {} } as ChestEntry["item"] });

function chestTile(entries: ChestEntry[], tileDc?: number) {
  return { flags: { core: { [CHEST_FLAG]: { name: "Baú", entries } }, world: tileDc === undefined ? {} : { [PERCEPTION_DC_FLAG]: tileDc } } };
}

describe("chests", () => {
  it("reads only valid chests", () => {
    expect(readChest(undefined)).toBeNull();
    expect(readChest({ [CHEST_FLAG]: { name: "" } })).toBeNull();
    expect(readChest({ [CHEST_FLAG]: { name: "Baú" } })).toEqual({ name: "Baú", entries: [], capacity: null });
  });

  it("fills up at its capacity, or at the global maximum without one", () => {
    const chest = { name: "Baú", entries: [entry("a", null), entry("b", null)], capacity: 2 };
    expect(isChestFull(chest)).toBe(true);
    expect(isChestFull({ ...chest, capacity: 3 })).toBe(false);
    expect(chestCapacity({ ...chest, capacity: null })).toBe(MAX_CHEST_ENTRIES);
  });

  it("lets everyone see an item the GM revealed", () => {
    const tile = chestTile([entry("a", 18, true), entry("b", 18)]);
    expect(visibleChestEntries(tile, null).map((found) => found.id)).toEqual(["a"]);
  });

  it("shows each character only the items their perception reaches", () => {
    const tile = chestTile([entry("a", null), entry("b", 12), entry("c", 18)]);
    expect(visibleChestEntries(tile, null).map((found) => found.id)).toEqual(["a"]);
    expect(visibleChestEntries(tile, 12).map((found) => found.id)).toEqual(["a", "b"]);
    expect(visibleChestEntries(tile, 20).map((found) => found.id)).toEqual(["a", "b", "c"]);
  });

  it("hides everything when the chest itself was not noticed", () => {
    const tile = chestTile([entry("a", null)], 15);
    expect(visibleChestEntries(tile, 10)).toEqual([]);
    expect(visibleChestEntries(tile, 15)).toHaveLength(1);
  });

  it("creates entry ids that do not collide", () => {
    const rolls = [0.5, 0.5, 0.25];
    const id = newChestEntryId([entry(newChestEntryId([], () => 0.5), null)], () => rolls.shift() ?? 0.1);
    expect(id).toBe(newChestEntryId([], () => 0.25));
  });
});
