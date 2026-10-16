import { describe, expect, it } from "vitest";
import { attributesForSkillRoll, skillRollFormula } from "./skillAttributeRoll";
import type { BoardContext } from "./boardContext";
import type { SheetLayout } from "@tabbletop/protocol";

describe("skillRollFormula", () => {
  it("keeps highest when the attribute has points and adds the skill", () => {
    expect(skillRollFormula("forca", 3)).toBe("if(eq(@forca, 0), 2d20kl, (@forca)d20kh) + 3");
  });

  it("omits a zero skill bonus", () => {
    expect(skillRollFormula("agili", 0)).toBe("if(eq(@agili, 0), 2d20kl, (@agili)d20kh)");
  });
});

describe("attributesForSkillRoll", () => {
  it("shows the numbers the player already put on the sheet", () => {
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Ficha",
          components: [
            { id: "a", kind: "number", x: 0, y: 0, w: 2, h: 2, key: "agilidade", label: "Agilidade", initial: 1 },
            { id: "f", kind: "number", x: 2, y: 0, w: 2, h: 2, key: "forca", label: "Força", initial: 1 },
            { id: "v", kind: "number", x: 4, y: 0, w: 2, h: 2, key: "vigor", label: "Vigor", initial: 1 },
          ],
        },
      ],
    } as SheetLayout;
    const stored: Record<string, unknown> = { agilidade: 3, forca: "2", vigor: 0 };
    const context = {
      store: { read: (key: string) => stored[key], values: () => stored },
      extraRollData: () => ({}),
      actor: { getRollData: () => ({}) },
    } as unknown as BoardContext;
    expect(attributesForSkillRoll(context, layout)).toEqual([
      { key: "agilidade", label: "Agilidade", value: 3 },
      { key: "forca", label: "Força", value: 2 },
      { key: "vigor", label: "Vigor", value: 0 },
    ]);
  });
});
