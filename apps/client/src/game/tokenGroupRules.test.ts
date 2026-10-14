import { describe, expect, it } from "vitest";
import { followerDestinations, readTokenGroup } from "./tokenGroupRules";

const tokens = [
  { id: "a", x: 100, y: 100, group: "g1" },
  { id: "b", x: 200, y: 100, group: "g1" },
  { id: "c", x: 300, y: 300, group: null },
];

describe("followerDestinations", () => {
  it("moves the rest of the group by the same step", () => {
    expect(followerDestinations(tokens[0]!, { x: 100, y: 50 }, tokens)).toEqual([{ _id: "b", x: 300, y: 150 }]);
  });

  it("ignores tokens without a group and moves that did not shift", () => {
    expect(followerDestinations(tokens[2]!, { x: 100, y: 0 }, tokens)).toEqual([]);
    expect(followerDestinations(tokens[0]!, { x: 0, y: 0 }, tokens)).toEqual([]);
  });
});

describe("readTokenGroup", () => {
  it("accepts only short alphanumeric ids", () => {
    expect(readTokenGroup("abc123")).toBe("abc123");
    expect(readTokenGroup("<script>")).toBeNull();
    expect(readTokenGroup(5)).toBeNull();
  });
});
