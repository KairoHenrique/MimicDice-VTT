import { describe, expect, it } from "vitest";
import { actorTypeFor, numberedNames } from "./actorCreationRules";

describe("actorTypeFor", () => {
  it("matches the role to the system's actor types", () => {
    expect(actorTypeFor("player", ["character", "npc"])).toBe("character");
    expect(actorTypeFor("enemy", ["character", "npc"])).toBe("npc");
    expect(actorTypeFor("enemy", ["character", "_template"])).toBe("character");
    expect(actorTypeFor("npc", ["base"])).toBe("base");
  });
});

describe("numberedNames", () => {
  it("numbers batches and caps them at 20", () => {
    expect(numberedNames("Goblin", 1)).toEqual(["Goblin"]);
    expect(numberedNames("Goblin", 3)).toEqual(["Goblin 1", "Goblin 2", "Goblin 3"]);
    expect(numberedNames("Goblin", 500)).toHaveLength(20);
    expect(numberedNames("Goblin", Number.NaN)).toEqual(["Goblin"]);
  });
});
