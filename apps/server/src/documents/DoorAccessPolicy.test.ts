import { describe, expect, it } from "vitest";
import { worldDocumentType } from "@tabbletop/common";
import { USER_ROLES, type DocumentSource } from "@tabbletop/protocol";
import { DocumentPermissionPolicy } from "./DocumentPermissionPolicy";
import { DoorAccessPolicy } from "./DoorAccessPolicy";

const wallDefinition = worldDocumentType("Wall") ?? ({ name: "Wall" } as any);
const player = { userId: "PlayerId00000001", role: USER_ROLES.PLAYER };
const gameMaster = { userId: "MasterId00000001", role: USER_ROLES.GAMEMASTER };

function door(overrides: Partial<DocumentSource> = {}): DocumentSource {
  return { _id: "WallId0000000001", c: [0, 0, 100, 0], door: 1, ds: 0, flags: {}, ...overrides } as DocumentSource;
}

function character(items: string[]): DocumentSource {
  return { _id: "ActorId000000001", name: "Kael", ownership: { default: 0, [player.userId]: 3 }, items: items.map((name, index) => ({ _id: `ItemId00000000${index}`, name })) } as DocumentSource;
}

function policies(actors: DocumentSource[]) {
  const permissions = new DocumentPermissionPolicy(() => ({}));
  return { permissions, doors: new DoorAccessPolicy(permissions, () => ({}), () => actors) };
}

describe("door access", () => {
  it("only treats open/close changes on real doors as door operations", () => {
    const { doors } = policies([]);
    expect(doors.isDoorOperation(wallDefinition, door(), { _id: "WallId0000000001", ds: 1 })).toBe(true);
    expect(doors.isDoorOperation(wallDefinition, door(), { _id: "WallId0000000001", ds: 2 })).toBe(false);
    expect(doors.isDoorOperation(wallDefinition, door(), { _id: "WallId0000000001", ds: 1, c: [0, 0, 5, 5] })).toBe(false);
    expect(doors.isDoorOperation(wallDefinition, door({ door: 0 }), { _id: "WallId0000000001", ds: 1 })).toBe(false);
  });

  it("lets players open plain doors but never locked ones", () => {
    const { doors } = policies([]);
    expect(() => doors.assertMayOperateDoor(player, door())).not.toThrow();
    expect(() => doors.assertMayOperateDoor(player, door({ ds: 2 }))).toThrow(/trancada/);
    expect(() => doors.assertMayOperateDoor(gameMaster, door({ ds: 2 }))).not.toThrow();
  });

  it("requires a character of the player to carry the key item, ignoring case and spacing", () => {
    const keyed = door({ flags: { world: { requiredItem: "Chave de Ferro" } } });
    expect(() => policies([character(["Tocha"])]).doors.assertMayOperateDoor(player, keyed)).toThrow(/Chave de Ferro/);
    expect(() => policies([character(["  chave  de ferro "])]).doors.assertMayOperateDoor(player, keyed)).not.toThrow();
    const notTheirs = { ...character(["Chave de Ferro"]), ownership: { default: 0 } } as DocumentSource;
    expect(() => policies([notTheirs]).doors.assertMayOperateDoor(player, keyed)).toThrow();
  });
});

describe("pinned objects", () => {
  const { permissions } = policies([]);

  it("stops players from moving an object the GM pinned", () => {
    expect(() => permissions.assertNotPinned(player, { _id: "TokenId000000001", locked: true } as DocumentSource, { x: 100 })).toThrow(/travou este objeto/);
    expect(() => permissions.assertNotPinned(player, { _id: "TokenId000000001", locked: true } as DocumentSource, { name: "Kael" })).not.toThrow();
  });

  it("never blocks the GM or unpinned objects", () => {
    expect(() => permissions.assertNotPinned(gameMaster, { _id: "TokenId000000001", locked: true } as DocumentSource, { x: 100 })).not.toThrow();
    expect(() => permissions.assertNotPinned(player, { _id: "TokenId000000001", locked: false } as DocumentSource, { x: 100 })).not.toThrow();
  });
});
