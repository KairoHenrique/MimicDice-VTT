import { describe, expect, it } from "vitest";
import { mayMoveUnownedToken } from "./tableRules.js";

const friendlyLinkedToken = { actorLink: true, disposition: 1 };
const playerActor = { flags: { world: { role: "player" } } };
const enemyActor = { flags: { world: { role: "enemy" } } };

describe("mayMoveUnownedToken", () => {
  it("only lets the owner drag under the default rule", () => {
    expect(mayMoveUnownedToken({ rule: "owner", token: friendlyLinkedToken, linkedActor: playerActor })).toBe(false);
  });

  it("decides party membership by the actor role when the actor is known", () => {
    expect(mayMoveUnownedToken({ rule: "party", token: {}, linkedActor: playerActor })).toBe(true);
    expect(mayMoveUnownedToken({ rule: "party", token: friendlyLinkedToken, linkedActor: enemyActor })).toBe(false);
    expect(mayMoveUnownedToken({ rule: "party", token: friendlyLinkedToken, linkedActor: null })).toBe(false);
  });

  it("falls back to linked friendly tokens when the actor is not visible", () => {
    expect(mayMoveUnownedToken({ rule: "party", token: friendlyLinkedToken, linkedActor: undefined })).toBe(true);
    expect(mayMoveUnownedToken({ rule: "party", token: { actorLink: false, disposition: 1 }, linkedActor: undefined })).toBe(false);
  });

  it("never allows hidden or locked tokens, even when freed", () => {
    const freed = { flags: { world: { freeMove: true } } };
    expect(mayMoveUnownedToken({ rule: "owner", token: freed, linkedActor: null })).toBe(true);
    expect(mayMoveUnownedToken({ rule: "owner", token: { ...freed, hidden: true }, linkedActor: null })).toBe(false);
    expect(mayMoveUnownedToken({ rule: "owner", token: { ...freed, locked: true }, linkedActor: null })).toBe(false);
  });
});
