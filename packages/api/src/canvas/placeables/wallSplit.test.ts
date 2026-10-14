import { describe, expect, it } from "vitest";
import { wallSplitPoint } from "./wallSplit";

const horizontal = { ax: 0, ay: 100, bx: 400, by: 100 };

describe("wallSplitPoint", () => {
  it("cuts on the grid corner the user aimed at when it lies on the wall", () => {
    expect(wallSplitPoint(horizontal, { x: 190, y: 104 }, { x: 200, y: 100 })).toEqual({ x: 200, y: 100 });
  });

  it("cuts right under the cursor when the nearest corner is off the wall", () => {
    const diagonal = { ax: 0, ay: 0, bx: 300, by: 150 };
    expect(wallSplitPoint(diagonal, { x: 101, y: 49 }, { x: 100, y: 0 })).toEqual({ x: 100, y: 50 });
  });

  it("refuses cuts that would leave a piece too short to grab", () => {
    expect(wallSplitPoint(horizontal, { x: 3, y: 100 }, { x: 0, y: 100 })).toBeNull();
    expect(wallSplitPoint(horizontal, { x: 398, y: 100 }, null)).toBeNull();
    expect(wallSplitPoint({ ax: 0, ay: 0, bx: 10, by: 0 }, { x: 5, y: 0 }, null)).toBeNull();
  });
});
