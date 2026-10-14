import { describe, expect, it } from "vitest";
import { pullToSceneRequestSchema, setupRequestSchema } from "./requests";

describe("pullToSceneRequestSchema", () => {
  const sceneId = "abcdefghijklmnop";

  it("accepts a pull with or without the GM camera", () => {
    expect(pullToSceneRequestSchema.safeParse({ sceneId }).success).toBe(true);
    expect(pullToSceneRequestSchema.safeParse({ sceneId, view: { x: 1200, y: 800, scale: 0.75 } }).success).toBe(true);
  });

  it("rejects zoom or coordinates outside the canvas limits", () => {
    expect(pullToSceneRequestSchema.safeParse({ sceneId, view: { x: 0, y: 0, scale: 50 } }).success).toBe(false);
    expect(pullToSceneRequestSchema.safeParse({ sceneId, view: { x: Number.POSITIVE_INFINITY, y: 0, scale: 1 } }).success).toBe(false);
  });
});

describe("setupRequestSchema", () => {
  it("lets the GM choose any non-empty password", () => {
    const base = { worldTitle: "Mesa", gameMasterName: "Mestre" };
    expect(setupRequestSchema.safeParse({ ...base, gameMasterPassword: "a1" }).success).toBe(true);
    expect(setupRequestSchema.safeParse({ ...base, gameMasterPassword: "" }).success).toBe(false);
  });
});
