import { describe, expect, it } from "vitest";
import { worldDocumentType } from "@tabbletop/common";
import { USER_ROLES } from "@tabbletop/protocol";
import { DocumentPermissionPolicy } from "./DocumentPermissionPolicy";
import type { DocumentNode } from "./documentTree";

const sceneAncestor: DocumentNode[] = [{ definition: worldDocumentType("Scene")!, source: { _id: "SceneId000000001", name: "Taverna" } }];
const actorAncestor: DocumentNode[] = [{ definition: worldDocumentType("Actor")!, source: { _id: "ActorId000000001", name: "Kael" } }];
const player = { userId: "PlayerId00000001", role: USER_ROLES.PLAYER };
const gameMaster = { userId: "MasterId00000001", role: USER_ROLES.GAMEMASTER };

function policy(locked: boolean): DocumentPermissionPolicy {
  return new DocumentPermissionPolicy(() => ({}), () => undefined, () => locked);
}

describe("map lock", () => {
  it("blocks players from touching anything inside a scene while locked", () => {
    expect(() => policy(true).assertMapUnlocked(player, sceneAncestor)).toThrow(/travou o mapa/);
  });

  it("never blocks the Game Master, nor players when the map is open", () => {
    expect(() => policy(true).assertMapUnlocked(gameMaster, sceneAncestor)).not.toThrow();
    expect(() => policy(false).assertMapUnlocked(player, sceneAncestor)).not.toThrow();
  });

  it("leaves character sheets and world documents editable", () => {
    expect(() => policy(true).assertMapUnlocked(player, actorAncestor)).not.toThrow();
    expect(() => policy(true).assertMapUnlocked(player, [])).not.toThrow();
  });
});
