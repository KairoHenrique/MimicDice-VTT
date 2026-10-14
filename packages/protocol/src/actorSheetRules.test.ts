import { describe, expect, it } from "vitest";
import { isSameJson, refusedActorChange } from "./actorSheetRules.js";

const layoutA = { version: 2, pages: [{ id: "p1", title: "Ficha", components: [] }] };
const layoutB = { version: 2, pages: [{ id: "p2", title: "Outra", components: [] }] };
const actorWith = (world: Record<string, unknown>) => ({ flags: { world } });
const player = { isGameMaster: false, playerEditingAllowed: false };

describe("refusedActorChange", () => {
  it("keeps players from rewriting their sheet layout", () => {
    expect(refusedActorChange({ ...player, before: actorWith({ sheetLayout: layoutA }), after: actorWith({ sheetLayout: layoutB }) })).toMatch(/não liberou/);
  });

  it("lets players switch to a model the GM handed to that actor", () => {
    const variants = [{ id: "v1", name: "Combate", layout: layoutB }];
    expect(refusedActorChange({ ...player, before: actorWith({ sheetLayout: layoutA, sheetVariants: variants }), after: actorWith({ sheetLayout: layoutB, sheetVariants: variants }) })).toBeNull();
  });

  it("never lets players change the models they were given", () => {
    const variants = [{ id: "v1", name: "Combate", layout: layoutB }];
    expect(refusedActorChange({ ...player, before: actorWith({ sheetLayout: layoutA }), after: actorWith({ sheetLayout: layoutA, sheetVariants: variants }) })).toMatch(/Só o mestre/);
  });

  it("allows editing when the GM turned it on, and the first sheet of a blank actor", () => {
    expect(refusedActorChange({ isGameMaster: false, playerEditingAllowed: true, before: actorWith({ sheetLayout: layoutA }), after: actorWith({ sheetLayout: layoutB }) })).toBeNull();
    expect(refusedActorChange({ ...player, before: actorWith({}), after: actorWith({ sheetLayout: layoutB }) })).toBeNull();
  });

  it("rejects malformed appearances for everyone", () => {
    const tooMany = Array.from({ length: 6 }, (_, index) => ({ id: `a${index}`, name: "Look", img: "a.png" }));
    expect(refusedActorChange({ isGameMaster: true, playerEditingAllowed: false, before: {}, after: actorWith({ appearances: tooMany }) })).toMatch(/Aparências/);
    expect(refusedActorChange({ ...player, before: {}, after: actorWith({ appearances: [{ id: "a1", name: "Look", img: "javascript:alert(1)" }] }) })).toMatch(/Aparências/);
  });

  it("only lets the GM apply or remove effects", () => {
    const poison = { id: "e1", definitionId: "envenenado", name: "Envenenado", description: "", icon: "fa-solid fa-skull-crossbones", color: "#3fa34d", damagePerTurn: 2, damageResourceId: "vida", actsLast: false, visionLimit: null, turnsLeft: 3 };
    expect(refusedActorChange({ ...player, before: actorWith({ effects: [poison] }), after: actorWith({ effects: [] }) })).toMatch(/efeitos/);
    expect(refusedActorChange({ isGameMaster: true, playerEditingAllowed: false, before: {}, after: actorWith({ effects: [poison] }) })).toBeNull();
    expect(refusedActorChange({ isGameMaster: true, playerEditingAllowed: false, before: {}, after: actorWith({ effects: [{ ...poison, icon: "<img src=x>" }] }) })).toMatch(/Efeitos inválidos/);
  });
});

describe("isSameJson", () => {
  it("ignores key order but not values", () => {
    expect(isSameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(isSameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(isSameJson([1, 2], [2, 1])).toBe(false);
  });
});
