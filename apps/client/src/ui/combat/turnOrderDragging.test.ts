import { describe, expect, it } from "vitest";
import { dropIndex } from "./turnOrderDragging";

const order = ["ana", "bruno", "goblin", "orc"];

describe("dropIndex", () => {
  it("places a row before or after the one it was dropped on", () => {
    expect(dropIndex(order, "orc", "bruno", false)).toBe(1);
    expect(dropIndex(order, "orc", "bruno", true)).toBe(2);
  });

  it("accounts for the dragged row leaving a gap above the target", () => {
    expect(dropIndex(order, "ana", "goblin", true)).toBe(2);
    expect(dropIndex(order, "ana", "orc", true)).toBe(3);
  });
});
