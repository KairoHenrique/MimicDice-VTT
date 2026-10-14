import { describe, expect, it } from "vitest";
import { countMembers, filterActors, FILTER_ALL, FILTER_PLAYERS } from "./actorFilters";

const actors = [
  { id: "a".repeat(16), name: "Lyra", isPlayerCharacter: true },
  { id: "b".repeat(16), name: "Goblin Arqueiro", isPlayerCharacter: false },
  { id: "c".repeat(16), name: "Elfa da Floresta", isPlayerCharacter: false },
];
const categories = [{ id: "elfos", name: "Elfos", color: "#27ae60", actorIds: ["c".repeat(16), "z".repeat(16)] }];

describe("filterActors", () => {
  it("keeps everyone for 'all' and only player characters for the fixed players chip", () => {
    expect(filterActors(actors, FILTER_ALL, categories, "")).toHaveLength(3);
    expect(filterActors(actors, FILTER_PLAYERS, categories, "").map((actor) => actor.name)).toEqual(["Lyra"]);
  });

  it("filters by GM category and by accent-insensitive name", () => {
    expect(filterActors(actors, "elfos", categories, "").map((actor) => actor.name)).toEqual(["Elfa da Floresta"]);
    expect(filterActors(actors, FILTER_ALL, categories, "GOBLÍN").map((actor) => actor.name)).toEqual(["Goblin Arqueiro"]);
    expect(filterActors(actors, "missing", categories, "")).toEqual([]);
  });
});

describe("countMembers", () => {
  it("ignores actors that no longer exist", () => {
    expect(countMembers(categories, new Set(actors.map((actor) => actor.id))).get("elfos")).toBe(1);
  });
});
