import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installFoundryApi } from "../installFoundryApi";
import { Collection } from "../utils/Collection";
import { Hooks } from "../hooks/Hooks";
import { ClientDatabaseBackend } from "./abstract/ClientDatabaseBackend";
import type { Actor as ActorClass } from "./clientDocuments";

const ACTOR_ID = "actorAAAAAAAAAAA";
const ITEM_ID = "itemAAAAAAAAAAAA";
const PLAYER_ID = "playerAAAAAAAAAA";

let Actor: typeof ActorClass;
let backend: ClientDatabaseBackend;

function characterSource() {
  return {
    _id: ACTOR_ID,
    name: "Heroína",
    type: "character",
    items: [{ _id: ITEM_ID, name: "Espada", type: "weapon" }],
    effects: [{ _id: "effectAAAAAAAAAA", name: "Bênção", changes: [{ key: "system.hp.value", value: "5", mode: 2 }] }],
    ownership: { default: 1, [PLAYER_ID]: 3 },
  };
}

beforeAll(() => {
  installFoundryApi({ info() {}, warn() {}, error() {}, notify() {} } as never);
  Actor = (globalThis as any).Actor;
});

beforeEach(() => {
  backend = new ClientDatabaseBackend({} as never);
  (globalThis as any).CONFIG.DatabaseBackend = backend;
  (globalThis as any).game = {
    documentTypes: { Actor: ["character"], Item: ["weapon"], ActiveEffect: ["base"] },
    model: { Actor: { character: { hp: { value: 10 } } }, Item: { weapon: { damage: "1d6" } }, ActiveEffect: { base: {} } },
    collections: new Collection(),
    modules: new Collection(),
    user: { id: PLAYER_ID, isGM: false },
    userId: PLAYER_ID,
    _documentsReady: true,
  };
});

describe("client documents", () => {
  it("applies template.json defaults and shares embedded sources with the parent", () => {
    const actor = new Actor(characterSource());
    const item = actor.items.get(ITEM_ID);
    expect(actor._source.system).toEqual({ hp: { value: 10 } });
    expect(item.system.damage).toBe("1d6");
    expect(item.parent).toBe(actor);
    expect(item._source).toBe(actor._source.items[0]);
    item.updateSource({ name: "Machado" });
    expect(actor._source.items[0].name).toBe("Machado");
    expect(item.uuid).toBe(`Actor.${ACTOR_ID}.Item.${ITEM_ID}`);
  });

  it("applies active effects to prepared data without touching the source", () => {
    const actor = new Actor(characterSource());
    expect(actor.system.hp.value).toBe(15);
    expect(actor._source.system.hp.value).toBe(10);
  });

  it("resolves ownership per player and falls back to the default level", () => {
    const actor = new Actor(characterSource());
    expect(actor.isOwner).toBe(true);
    expect(actor.getUserLevel({ id: "otherAAAAAAAAAAA", isGM: false })).toBe(1);
    expect(actor.testUserPermission({ id: "otherAAAAAAAAAAA", isGM: false }, "LIMITED", { exact: true })).toBe(true);
  });

  it("applies server responses to collections and fires Foundry hooks", () => {
    const actors = new (globalThis as any).Actors();
    (globalThis as any).game.collections.set("Actor", actors);
    const createHook = vi.fn();
    const updateHook = vi.fn();
    Hooks.on("createItem", createHook);
    Hooks.on("updateActor", updateHook);

    backend.handleModifyDocument({ type: "Actor", action: "create", userId: PLAYER_ID, operation: {}, result: [characterSource()] });
    const actor = actors.get(ACTOR_ID);
    backend.handleModifyDocument({
      type: "Item",
      action: "create",
      userId: PLAYER_ID,
      operation: { parentUuid: actor.uuid },
      result: [{ _id: "itemBBBBBBBBBBBB", name: "Escudo", type: "weapon", system: { damage: "1d4" } }],
    });
    backend.handleModifyDocument({ type: "Actor", action: "update", userId: PLAYER_ID, operation: {}, result: [{ _id: ACTOR_ID, ownership: { [`-=${PLAYER_ID}`]: null } }] });

    expect(actor.items.size).toBe(2);
    expect(actor._source.items).toHaveLength(2);
    expect(createHook).toHaveBeenCalledOnce();
    expect(updateHook).toHaveBeenCalledOnce();
    expect(actor._source.ownership).toEqual({ default: 1 });
    expect(actor.isOwner).toBe(false);

    backend.handleModifyDocument({ type: "Actor", action: "delete", userId: PLAYER_ID, operation: {}, result: [ACTOR_ID] });
    expect(actors.has(ACTOR_ID)).toBe(false);
  });

  it("rejects flag scopes that are not active packages", () => {
    const actor = new Actor(characterSource());
    expect(() => actor.getFlag("modulo-inexistente", "x")).toThrow(/not valid/);
    expect(actor.getFlag("world", "x")).toBeUndefined();
  });
});
