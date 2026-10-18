import { describe, expect, it } from "vitest";
import type { SheetLayout } from "@tabbletop/protocol";
import { actorSkillPoints, resolveActorAttribute } from "./blindCheckManager";
import type { BoardContext } from "../../ui/sheets/layout/boardContext";

function makeContext(stored: Record<string, unknown>): BoardContext {
  return {
    store: {
      read: (key: string) => stored[key],
      values: () => stored,
    },
    extraRollData: () => ({}),
    actor: {
      getRollData: () => stored,
    },
  } as unknown as BoardContext;
}

describe("blindCheckManager", () => {
  const layout = {
    version: 2,
    pages: [
      {
        id: "main",
        title: "Principal",
        components: [
          { id: "c1", kind: "number", x: 0, y: 0, w: 2, h: 2, key: "agilidade", label: "Agilidade", initial: 3 },
          { id: "c2", kind: "number", x: 2, y: 0, w: 2, h: 2, key: "presenca", label: "Presença", initial: 1 },
          {
            id: "c3",
            kind: "skills",
            x: 0,
            y: 2,
            w: 4,
            h: 4,
            key: "pericias",
            skills: [
              { key: "percepcao", label: "Percepção" },
              { key: "iniciativa", label: "Iniciativa" },
            ],
          },
        ],
      },
    ],
  } as SheetLayout;

  it("reads skill points correctly from actor store", () => {
    const context = makeContext({ pericias: { percepcao: 5, iniciativa: 10 } });

    expect(actorSkillPoints(context, layout, "Percepção")).toBe(5);
    expect(actorSkillPoints(context, layout, "percepcao")).toBe(5);
    expect(actorSkillPoints(context, layout, "Iniciativa")).toBe(10);
    expect(actorSkillPoints(context, layout, "Ocultismo")).toBe(0);
  });

  it("resolves specific attribute or picks best attribute on auto", () => {
    const context = makeContext({ agilidade: 3, presenca: 1 });

    const specific = resolveActorAttribute(context, layout, "presenca");
    expect(specific.key).toBe("presenca");
    expect(specific.value).toBe(1);

    const auto = resolveActorAttribute(context, layout, "auto");
    expect(auto.key).toBe("agilidade");
    expect(auto.value).toBe(3);
  });
});
