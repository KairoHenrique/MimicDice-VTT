import { describe, expect, it } from "vitest";
import { parseStoredMemory, reconcileSightMemory, serializeMemory, type RememberedLook } from "./sightMemoryRules";

const look = (x: number, src = "chest.png"): RememberedLook => ({ documentName: "Tile", x, y: 0, width: 100, height: 100, rotation: 0, alpha: 1, src });
const inSightBelow = (limit: number) => (area: RememberedLook) => area.x < limit;

describe("reconcileSightMemory", () => {
  it("remembers what is in sight and shows the old look once it leaves sight", () => {
    const memory = new Map<string, RememberedLook>();
    const first = reconcileSightMemory(memory, new Map([["Tile.a", { look: look(0), inSight: true }]]), inSightBelow(50));
    expect([...first.shown]).toEqual(["Tile.a"]);
    expect(first.changed).toBe(true);
    const moved = reconcileSightMemory(memory, new Map([["Tile.a", { look: look(500), inSight: false }]]), inSightBelow(-1));
    expect(moved.shown.size).toBe(0);
    expect(moved.ghosts).toEqual([["Tile.a", look(0)]]);
  });

  it("keeps the ghost of a removed object until its spot comes into view", () => {
    const memory = new Map([["Tile.a", look(0)]]);
    expect(reconcileSightMemory(memory, new Map(), inSightBelow(-1)).ghosts).toHaveLength(1);
    const seen = reconcileSightMemory(memory, new Map(), inSightBelow(50));
    expect(seen.ghosts).toHaveLength(0);
    expect(memory.size).toBe(0);
  });

  it("never reveals objects that were never seen", () => {
    const result = reconcileSightMemory(new Map(), new Map([["Tile.b", { look: look(900), inSight: false }]]), inSightBelow(50));
    expect(result.shown.size).toBe(0);
    expect(result.ghosts).toHaveLength(0);
  });
});

describe("stored memory", () => {
  it("round-trips and drops malformed entries", () => {
    const memory = new Map([["Tile.a", look(10)]]);
    const restored = parseStoredMemory(serializeMemory(memory));
    expect(restored.get("Tile.a")).toEqual(look(10));
    expect(parseStoredMemory('{"Tile.x":{"documentName":"Tile","x":"bad"}}').size).toBe(0);
    expect(parseStoredMemory("not json").size).toBe(0);
  });
});
