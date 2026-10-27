import { describe, expect, it, vi } from "vitest";
import { ACTOR_EXCHANGE_FORMAT, actorExchangeFileSchema } from "@tabbletop/protocol";
import { parseExportedActorPayload, serializeActorData, stripDocumentIds } from "./actorExchange";

// Stub global foundry deepClone for unit tests
(globalThis as any).foundry = {
  utils: {
    deepClone: (obj: any) => JSON.parse(JSON.stringify(obj)),
  },
};

describe("actorExchange", () => {
  it("stripDocumentIds deeply strips _id from nested objects and arrays", () => {
    const input = {
      _id: "actor123",
      name: "Guerreiro",
      items: [
        { _id: "item1", name: "Espada Longa", type: "weapon" },
        { _id: "item2", name: "Escudo", type: "armor" },
      ],
      effects: [{ _id: "eff1", label: "Bênção" }],
      system: {
        stats: { _id: "statId", str: 16, dex: 12 },
      },
    };

    const stripped: any = stripDocumentIds(input);
    expect(stripped._id).toBeUndefined();
    expect(stripped.name).toBe("Guerreiro");
    expect(stripped.items[0]._id).toBeUndefined();
    expect(stripped.items[0].name).toBe("Espada Longa");
    expect(stripped.items[1]._id).toBeUndefined();
    expect(stripped.effects[0]._id).toBeUndefined();
    expect(stripped.system.stats._id).toBeUndefined();
    expect(stripped.system.stats.str).toBe(16);
  });

  it("serializeActorData correctly packages actor data and layout for export", () => {
    const mockActor = {
      id: "act-1",
      name: "Aragorn",
      type: "character",
      img: "icons/aragorn.png",
      system: { hp: 45, maxHp: 50, str: 18 },
      items: [{ _id: "it-1", name: "Andúril", system: { damage: "1d8+4" } }],
      effects: [],
      prototypeToken: { name: "Aragorn", width: 1, height: 1 },
      flags: {
        mimicdice: {
          role: "player",
          sheetLayout: { pages: [{ id: "p1", name: "Geral", sections: [] }] },
        },
      },
      toObject: function () {
        return {
          _id: this.id,
          name: this.name,
          type: this.type,
          img: this.img,
          system: this.system,
          items: this.items,
          effects: this.effects,
          prototypeToken: this.prototypeToken,
          flags: this.flags,
        };
      },
    };

    const serialized = serializeActorData(mockActor);
    expect(serialized.name).toBe("Aragorn");
    expect(serialized.type).toBe("character");
    expect(serialized.img).toBe("icons/aragorn.png");
    expect(serialized.system).toEqual({ hp: 45, maxHp: 50, str: 18 });
    expect(serialized.items[0].name).toBe("Andúril");
    expect((serialized.items[0] as any)._id).toBeUndefined();
    expect(serialized.flags.mimicdice).toBeDefined();

    const exchangeFile = {
      format: ACTOR_EXCHANGE_FORMAT,
      version: 1,
      title: serialized.name,
      actor: serialized,
    };

    const parseResult = actorExchangeFileSchema.safeParse(exchangeFile);
    expect(parseResult.success).toBe(true);
  });

  it("parseExportedActorPayload parses single actor exchange file", () => {
    const file = {
      format: ACTOR_EXCHANGE_FORMAT,
      version: 1,
      actor: {
        name: "Legolas",
        type: "character",
        system: { dex: 20 },
        items: [],
        effects: [],
        flags: {},
      },
    };

    const parsed = parseExportedActorPayload(file);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("Legolas");
    expect(parsed[0].system.dex).toBe(20);
  });

  it("parseExportedActorPayload parses multi-actor bundle", () => {
    const file = {
      format: ACTOR_EXCHANGE_FORMAT,
      version: 1,
      actors: [
        { name: "Goblin 1", type: "npc", system: { hp: 7 }, items: [], effects: [], flags: {} },
        { name: "Goblin 2", type: "npc", system: { hp: 7 }, items: [], effects: [], flags: {} },
      ],
    };

    const parsed = parseExportedActorPayload(file);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe("Goblin 1");
    expect(parsed[1].name).toBe("Goblin 2");
  });

  it("parseExportedActorPayload handles raw actor JSON from direct exports", () => {
    const rawFoundryActor = {
      name: "Gimli",
      type: "character",
      system: { con: 18 },
      items: [{ _id: "axe", name: "Machado de Batalha" }],
    };

    const parsed = parseExportedActorPayload(rawFoundryActor);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe("Gimli");
    expect(parsed[0].items[0].name).toBe("Machado de Batalha");
    expect((parsed[0].items[0] as any)._id).toBeUndefined();
  });

  it("parseExportedActorPayload rejects invalid formats with clear messages", () => {
    expect(() => parseExportedActorPayload(null)).toThrow("JSON válido");
    expect(() => parseExportedActorPayload({ format: "random" })).toThrow("não foi reconhecido como uma ficha pronta");
    expect(() => parseExportedActorPayload({ format: "mimicdice-sheets" })).toThrow("modelos de layout");
  });
});
