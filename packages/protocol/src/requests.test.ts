import { describe, expect, it } from "vitest";
import { groupBlindCheckBroadcastSchema, groupBlindCheckRequestSchema, groupBlindCheckRollSchema, MAX_PULLED_USERS, pullToSceneRequestSchema, setupRequestSchema, sheetPingBroadcastSchema, sheetPingRequestSchema } from "./requests";

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

  it("accepts a pull aimed at chosen players only", () => {
    expect(pullToSceneRequestSchema.safeParse({ sceneId, userIds: ["qrstuvwxyzabcdef"] }).success).toBe(true);
  });

  it("rejects an empty, oversized or malformed list of players", () => {
    expect(pullToSceneRequestSchema.safeParse({ sceneId, userIds: [] }).success).toBe(false);
    expect(pullToSceneRequestSchema.safeParse({ sceneId, userIds: Array.from({ length: MAX_PULLED_USERS + 1 }, () => "qrstuvwxyzabcdef") }).success).toBe(false);
    expect(pullToSceneRequestSchema.safeParse({ sceneId, userIds: ["../etc"] }).success).toBe(false);
  });
});

describe("setupRequestSchema", () => {
  it("lets the GM choose any password, or none at all", () => {
    const base = { worldTitle: "Mesa", gameMasterName: "Mestre" };
    expect(setupRequestSchema.safeParse({ ...base, gameMasterPassword: "a1" }).success).toBe(true);
    expect(setupRequestSchema.safeParse({ ...base, gameMasterPassword: "" }).success).toBe(true);
    expect(setupRequestSchema.safeParse({ ...base, gameMasterPassword: "x".repeat(129) }).success).toBe(false);
  });
});

describe("sheetPing schemas", () => {
  it("accepts a valid sheet ping request with target identifiers", () => {
    const valid = {
      actorId: "abcdefghijklmnop",
      tab: "sheet",
      pageId: "page-1",
      componentId: "comp-123",
      skillKey: "luta",
      label: "Perícia Luta",
    };
    expect(sheetPingRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("validates broadcast schema with author userId", () => {
    const broadcast = {
      actorId: "abcdefghijklmnop",
      tab: "rolls",
      abilityId: "0",
      label: "Golpe",
      userId: "qrstuvwxyzabcdef",
    };
    expect(sheetPingBroadcastSchema.safeParse(broadcast).success).toBe(true);
  });

  it("rejects invalid actorId or unknown tab in sheet ping", () => {
    expect(sheetPingRequestSchema.safeParse({ actorId: "invalid!id" }).success).toBe(false);
    expect(sheetPingRequestSchema.safeParse({ actorId: "abcdefghijklmnop", tab: "invalid_tab" }).success).toBe(false);
  });

  it("validates group blind check request, broadcast and roll schemas", () => {
    const validRequest = {
      checkId: "check-1",
      skillLabel: "Percepção",
      attributeKey: "presenca",
      attributeLabel: "Presença",
      dc: 15,
      message: "O mestre pediu uma rolagem misteriosa...",
      targetActorIds: ["abcdefghijklmnop"],
    };
    expect(groupBlindCheckRequestSchema.safeParse(validRequest).success).toBe(true);

    const validBroadcast = {
      checkId: "check-1",
      message: "O mestre pediu uma rolagem misteriosa...",
      targetActorIds: ["abcdefghijklmnop"],
      authorName: "Mestre",
      userId: "qrstuvwxyzabcdef",
    };
    expect(groupBlindCheckBroadcastSchema.safeParse(validBroadcast).success).toBe(true);

    const validRoll = {
      checkId: "check-1",
      actorId: "abcdefghijklmnop",
    };
    expect(groupBlindCheckRollSchema.safeParse(validRoll).success).toBe(true);
    expect(groupBlindCheckRollSchema.safeParse({ checkId: "check-1", actorId: "invalid!" }).success).toBe(false);
  });
});


