import { describe, expect, it } from "vitest";
import { isArmedTrap, isConcealedFrom, parsePerceptionScores, readConcealment } from "./concealment";

const trap = (triggered: boolean) => ({ name: "Fosso", triggered });

describe("isConcealedFrom", () => {
  it("hides objects with a DC from players who did not reach it", () => {
    const concealment = readConcealment({ perceptionDc: 15 });
    expect(isConcealedFrom(concealment, null)).toBe(true);
    expect(isConcealedFrom(concealment, 14)).toBe(true);
    expect(isConcealedFrom(concealment, 15)).toBe(false);
  });

  it("keeps armed traps hidden unless perception beats their DC, and shows triggered ones", () => {
    expect(isConcealedFrom(readConcealment({ trap: trap(false) }), 20)).toBe(true);
    expect(isConcealedFrom(readConcealment({ trap: trap(false), perceptionDc: 12 }), 12)).toBe(false);
    expect(isConcealedFrom(readConcealment({ trap: trap(true) }), null)).toBe(false);
    expect(isArmedTrap(readConcealment({ trap: trap(false) }))).toBe(true);
  });

  it("ignores malformed flags", () => {
    expect(readConcealment({ perceptionDc: "x", trap: { name: "" } })).toEqual({ perceptionDc: null, trap: null });
    expect(isConcealedFrom(readConcealment(null), null)).toBe(false);
  });
});

describe("parsePerceptionScores", () => {
  it("keeps only valid character ids and scores", () => {
    expect(parsePerceptionScores({ abc: 12 })).toEqual({ abc: 12 });
    expect(parsePerceptionScores({ abc: 500 })).toEqual({});
    expect(parsePerceptionScores("x")).toEqual({});
  });
});
