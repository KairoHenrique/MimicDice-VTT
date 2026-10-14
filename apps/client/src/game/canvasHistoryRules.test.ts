import { describe, expect, it } from "vitest";
import { CanvasHistory, HISTORY_LIMIT, inverseUpdate } from "./canvasHistoryRules";

describe("inverseUpdate", () => {
  it("restores previous values and removes fields that did not exist", () => {
    const source = { _id: "t1", x: 100, y: 200, flags: { world: { keep: 1 } } };
    expect(inverseUpdate(source, { _id: "t1", x: 150, flags: { world: { added: true } } })).toEqual({ _id: "t1", x: 100, "flags.world.-=added": null });
  });

  it("brings back a field that the change deleted", () => {
    const source = { _id: "t1", flags: { world: { note: "a" } } };
    expect(inverseUpdate(source, { flags: { world: { "-=note": null } } })).toEqual({ _id: "t1", "flags.world.note": "a" });
  });
});

describe("CanvasHistory", () => {
  it("groups a burst into one step and keeps a bounded stack", () => {
    const history = new CanvasHistory();
    history.record("s1", { action: "create", documentName: "Tile", ids: ["a"] });
    history.record("s1", { action: "create", documentName: "Tile", ids: ["b"] });
    history.seal();
    history.record("s1", { action: "create", documentName: "Wall", ids: ["c"] });
    expect(history.pop()?.entries).toHaveLength(1);
    expect(history.pop()?.entries).toHaveLength(2);
    expect(history.pop()).toBeNull();
    for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
      history.record("s1", { action: "create", documentName: "Tile", ids: [String(index)] });
      history.seal();
    }
    expect(history.size).toBe(HISTORY_LIMIT);
  });

  it("starts a new step when records are further apart than the burst window", () => {
    const history = new CanvasHistory(60);
    history.record("s1", { action: "create", documentName: "Tile", ids: ["a"] }, 1000);
    history.record("s1", { action: "create", documentName: "Tile", ids: ["b"] }, 1030);
    history.record("s1", { action: "create", documentName: "Tile", ids: ["c"] }, 5000);
    expect(history.pop()?.entries).toHaveLength(1);
    expect(history.pop()?.entries).toHaveLength(2);
  });
});
