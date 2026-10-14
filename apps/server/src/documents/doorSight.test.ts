import { describe, expect, it } from "vitest";
import { isDoorSeen, tokenEye } from "./doorSight";

const door = { _id: "door", c: [600, 350, 600, 450], door: 1, ds: 0 };
const roomWalls = [
  { _id: "n", c: [200, 200, 600, 200] },
  { _id: "e1", c: [600, 200, 600, 350] },
  { _id: "e2", c: [600, 450, 600, 600] },
  door,
];

describe("door sight", () => {
  it("sees a door in the wall of the room the token is in", () => {
    expect(isDoorSeen(door, [{ x: 400, y: 400 }], roomWalls)).toBe(true);
  });

  it("does not see a door behind another wall", () => {
    const farDoor = { _id: "far", c: [1000, 350, 1000, 450], door: 1, ds: 0 };
    const between = { _id: "between", c: [800, 0, 800, 1000] };
    expect(isDoorSeen(farDoor, [{ x: 400, y: 400 }], [...roomWalls, between, farDoor])).toBe(false);
  });

  it("looks through open doors and walls that do not block sight", () => {
    const farDoor = { _id: "far", c: [1000, 350, 1000, 450], door: 1, ds: 0 };
    const openDoor = { ...door, ds: 1 };
    const window = { _id: "window", c: [800, 0, 800, 1000], sight: 0 };
    expect(isDoorSeen(farDoor, [{ x: 400, y: 400 }], [roomWalls[0]!, roomWalls[1]!, roomWalls[2]!, openDoor, window, farDoor])).toBe(true);
  });

  it("needs at least one token", () => {
    expect(isDoorSeen(door, [], roomWalls)).toBe(false);
  });

  it("finds the token center from its grid size", () => {
    expect(tokenEye({ x: 300, y: 300, width: 2, height: 1 }, 100)).toEqual({ x: 400, y: 350 });
  });
});
