import { describe, expect, it } from "vitest";
import { embeddedDocumentType, worldDocumentType } from "@tabbletop/common";
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

describe("scene pause", () => {
  const paused = new DocumentPermissionPolicy(() => ({}), () => undefined, () => false, () => true);

  it("freezes the scene for players with its own message", () => {
    expect(() => paused.assertMapUnlocked(player, sceneAncestor)).toThrow(/pausada/);
  });

  it("lets the GM keep editing and players keep their sheets", () => {
    expect(() => paused.assertMapUnlocked(gameMaster, sceneAncestor)).not.toThrow();
    expect(() => paused.assertMapUnlocked(player, actorAncestor)).not.toThrow();
  });
});

describe("closed table session", () => {
  const closed = new DocumentPermissionPolicy(() => ({}), () => undefined, () => false, () => false, () => true);

  it("keeps players off the board until the GM starts the session", () => {
    expect(() => closed.assertMapUnlocked(player, sceneAncestor)).toThrow(/sessão está fechada/);
  });

  it("still lets the GM prepare scenes and players use their sheets", () => {
    expect(() => closed.assertMapUnlocked(gameMaster, sceneAncestor)).not.toThrow();
    expect(() => closed.assertMapUnlocked(player, actorAncestor)).not.toThrow();
  });
});

describe("locked drawings", () => {
  const drawingDefinition = embeddedDocumentType("Drawing")!;
  const tokenDefinition = embeddedDocumentType("Token")!;
  const lockedDrawing = { _id: "DrawingId0000001", author: player.userId, locked: true };

  it("stops players, even the author, from editing or erasing a locked drawing", () => {
    expect(() => policy(false).assertAuthoredNotLocked(player, drawingDefinition, lockedDrawing)).toThrow(/travou este desenho/);
  });

  it("lets the GM handle locked drawings and players handle unlocked ones", () => {
    expect(() => policy(false).assertAuthoredNotLocked(gameMaster, drawingDefinition, lockedDrawing)).not.toThrow();
    expect(() => policy(false).assertAuthoredNotLocked(player, drawingDefinition, { ...lockedDrawing, locked: false })).not.toThrow();
  });

  it("lets only the author, the GM and the players the GM allowed edit a drawing", () => {
    const gmText = { _id: "DrawingId0000002", author: gameMaster.userId, editors: [player.userId] };
    const otherPlayer = { userId: "PlayerId00000002", role: USER_ROLES.PLAYER };
    expect(() => policy(false).assertOwner(player, drawingDefinition, gmText, sceneAncestor)).not.toThrow();
    expect(() => policy(false).assertOwner(otherPlayer, drawingDefinition, gmText, sceneAncestor)).toThrow(/Sem permissão/);
    expect(() => policy(false).assertOwner(player, drawingDefinition, { ...gmText, editors: [] }, sceneAncestor)).toThrow(/Sem permissão/);
  });

  it("leaves pinned tokens to the placement rule", () => {
    expect(() => policy(false).assertAuthoredNotLocked(player, tokenDefinition, { _id: "TokenId000000001", locked: true })).not.toThrow();
  });
});

describe("sheets the GM shared", () => {
  const actorDefinition = worldDocumentType("Actor")!;
  const itemDefinition = embeddedDocumentType("Item")!;
  const tokenDefinition = embeddedDocumentType("Token")!;
  const baseInventory = { _id: "StashActor000001", ownership: { default: 2 }, flags: { world: { sheetShare: { [player.userId]: "edit", all: "view" } } } };
  const sharedAncestor: DocumentNode[] = [{ definition: actorDefinition, source: baseInventory }];
  const shared = new DocumentPermissionPolicy(() => ({}), (id) => (id === baseInventory._id ? (baseInventory as any) : undefined));
  const otherPlayer = { userId: "PlayerId00000002", role: USER_ROLES.PLAYER };

  it("lets a player shared for editing change the sheet and its items", () => {
    expect(() => shared.assertOwner(player, actorDefinition, baseInventory)).not.toThrow();
    expect(() => shared.assertOwner(player, itemDefinition, { _id: "ItemId0000000001" }, sharedAncestor)).not.toThrow();
    expect(() => shared.assertCanDelete(player, itemDefinition, { _id: "ItemId0000000001" }, sharedAncestor)).not.toThrow();
  });

  it("keeps view-only players read-only", () => {
    expect(() => shared.assertOwner(otherPlayer, actorDefinition, baseInventory)).toThrow(/Sem permissão/);
    expect(() => shared.assertOwner(otherPlayer, itemDefinition, { _id: "ItemId0000000001" }, sharedAncestor)).toThrow(/Sem permissão/);
  });

  it("never lets the player delete the shared sheet or control its tokens", () => {
    expect(() => shared.assertCanDelete(player, actorDefinition, baseInventory)).toThrow(/excluir/);
    expect(() => shared.assertOwner(player, tokenDefinition, { _id: "TokenId000000001", actorId: baseInventory._id }, sceneAncestor)).toThrow(/Sem permissão/);
  });
});

describe("dragging tokens the player does not control", () => {
  const tokenDefinition = embeddedDocumentType("Token")!;
  const actors: Record<string, Record<string, unknown>> = {
    HeroActor0000001: { _id: "HeroActor0000001", ownership: {}, flags: { world: { role: "player" } } },
    GoblinActor00001: { _id: "GoblinActor00001", ownership: {}, flags: { world: { role: "enemy" } } },
  };
  const withRule = (rule: "owner" | "party") => new DocumentPermissionPolicy(() => ({}), (id) => actors[id] as any, () => false, () => false, () => false, () => rule);
  const allyToken = { _id: "TokenId000000001", actorId: "HeroActor0000001" };
  const goblinToken = { _id: "TokenId000000002", actorId: "GoblinActor00001" };
  const move = { _id: "TokenId000000001", x: 100, y: 200 };

  it("only lets whoever controls the token move it by default", () => {
    expect(() => withRule("owner").assertOwnerOrMayMove(player, tokenDefinition, allyToken, move)).toThrow(/Sem permissão/);
  });

  it("lets players drag the other players' characters when the GM allows it, but not enemies", () => {
    expect(() => withRule("party").assertOwnerOrMayMove(player, tokenDefinition, allyToken, move)).not.toThrow();
    expect(() => withRule("party").assertOwnerOrMayMove(player, tokenDefinition, goblinToken, { ...move, _id: goblinToken._id })).toThrow(/Sem permissão/);
  });

  it("lets anyone drag a token the GM marked as free, and nothing else on it", () => {
    const freeToken = { ...goblinToken, flags: { world: { freeMove: true } } };
    expect(() => withRule("owner").assertOwnerOrMayMove(player, tokenDefinition, freeToken, { _id: freeToken._id, x: 5, y: 5 })).not.toThrow();
    expect(() => withRule("owner").assertOwnerOrMayMove(player, tokenDefinition, freeToken, { _id: freeToken._id, x: 5, hidden: true })).toThrow(/Sem permissão/);
    expect(() => withRule("owner").assertOwnerOrMayMove(player, tokenDefinition, { ...freeToken, hidden: true }, { _id: freeToken._id, x: 5 })).toThrow(/Sem permissão/);
  });
});
