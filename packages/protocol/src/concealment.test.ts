import { describe, expect, it } from "vitest";
import { hasPerceptionSecret, improvesPerception, isArmedTrap, isConcealedFrom, parsePerceptionScores, perceptionOfCharacters, perceptionScoresUpdate, readConcealment, scenePerceptionScores } from "./concealment";

describe("scene perception scores", () => {
  it("reads only the scene's own scores", () => {
    expect(scenePerceptionScores({ perceptionScores: { abc: 14 } })).toEqual({ abc: 14 });
    expect(scenePerceptionScores(undefined)).toEqual({});
  });

  it("sets new scores and removes cleared ones", () => {
    expect(perceptionScoresUpdate({ abc: 10, old: 5 }, { abc: 12 })).toEqual({
      "flags.world.perceptionScores.abc": 12,
      "flags.world.perceptionScores.-=old": null,
    });
  });
});

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

  it("shows revealed objects and armed traps to everyone", () => {
    expect(isConcealedFrom(readConcealment({ perceptionDc: 18, revealed: true }), null)).toBe(false);
    expect(isConcealedFrom(readConcealment({ trap: trap(false), revealed: true }), null)).toBe(false);
    expect(isArmedTrap(readConcealment({ trap: trap(false), revealed: true }))).toBe(true);
  });

  it("ignores malformed flags", () => {
    expect(readConcealment({ perceptionDc: "x", trap: { name: "" }, perceivedBy: "x" })).toEqual({ perceptionDc: null, trap: null, revealed: false, perceivedBy: {} });
    expect(isConcealedFrom(readConcealment(null), null)).toBe(false);
  });
});

describe("rolls made with the object in sight", () => {
  const concealment = readConcealment({ perceptionDc: 15, perceivedBy: { ana: 16, bia: 9 } });

  it("uses the best roll among the given characters, ignoring those who never saw the object", () => {
    expect(perceptionOfCharacters(concealment, ["bia", "ana"])).toBe(16);
    expect(perceptionOfCharacters(concealment, ["bia"])).toBe(9);
    expect(perceptionOfCharacters(concealment, ["caio"])).toBeNull();
  });

  it("keeps only rolls that beat the stored one", () => {
    expect(improvesPerception(concealment, "ana", 12)).toBe(false);
    expect(improvesPerception(concealment, "bia", 10)).toBe(true);
    expect(improvesPerception(concealment, "caio", 0)).toBe(true);
  });

  it("knows which objects a roll can uncover", () => {
    expect(hasPerceptionSecret(concealment)).toBe(true);
    expect(hasPerceptionSecret(readConcealment({}))).toBe(false);
    expect(hasPerceptionSecret(readConcealment({}), true)).toBe(true);
    expect(hasPerceptionSecret(readConcealment({ perceptionDc: 15, revealed: true }))).toBe(false);
  });
});

describe("parsePerceptionScores", () => {
  it("keeps only valid character ids and scores", () => {
    expect(parsePerceptionScores({ abc: 12 })).toEqual({ abc: 12 });
    expect(parsePerceptionScores({ abc: 500 })).toEqual({});
    expect(parsePerceptionScores("x")).toEqual({});
  });
});
