import { describe, expect, it } from "vitest";
import { MAX_ABILITIES, MAX_ROLLS_PER_ABILITY, ROLL_FORMULA_MAX, moveItem, readAbilities, removeAt, replaceAt, rollFlavor } from "./abilityRules";

describe("sheet abilities", () => {
  it("turns old roll buttons into abilities with one roll", () => {
    expect(readAbilities(undefined, [{ label: "Ataque", formula: "1d20 + @forca" }, { label: "x" }])).toEqual([
      { name: "Ataque", description: "", rolls: [{ label: "Rolar", formula: "1d20 + @forca" }] },
    ]);
  });

  it("prefers saved abilities over old roll buttons", () => {
    const saved = [{ name: "Golpe", description: "Corta", rolls: [{ label: "Acerto", formula: "1d20" }, { label: "Efeito", formula: "2d6" }] }];
    expect(readAbilities(saved, [{ label: "Velho", formula: "1d4" }])).toEqual(saved);
  });

  it("cleans malformed data and enforces limits", () => {
    const manyRolls = Array.from({ length: MAX_ROLLS_PER_ABILITY + 5 }, () => ({ label: "", formula: "1d6" }));
    const [ability] = readAbilities([{ name: 5, description: null, rolls: [...manyRolls, { formula: "" }] }, "lixo", null], undefined);
    expect(ability.name).toBe("");
    expect(ability.description).toBe("");
    expect(ability.rolls).toHaveLength(MAX_ROLLS_PER_ABILITY);
    expect(ability.rolls[0].label).toBe("Rolagem");
    expect(readAbilities([{ rolls: [{ formula: "1".repeat(ROLL_FORMULA_MAX + 50) }] }], undefined)[0].rolls[0].formula).toHaveLength(ROLL_FORMULA_MAX);
    expect(readAbilities(Array.from({ length: MAX_ABILITIES + 3 }, () => ({ name: "a", rolls: [] })), undefined)).toHaveLength(MAX_ABILITIES);
  });

  it("edits lists without mutating them", () => {
    const list = ["a", "b", "c"];
    expect(replaceAt(list, 1, "x")).toEqual(["a", "x", "c"]);
    expect(removeAt(list, 0)).toEqual(["b", "c"]);
    expect(moveItem(list, 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });

  it("names chat rolls after the ability", () => {
    expect(rollFlavor({ name: "Bola de fogo", description: "", rolls: [] }, { label: "Efeito", formula: "8d6" })).toBe("Bola de fogo: Efeito");
    expect(rollFlavor({ name: "", description: "", rolls: [] }, { label: "Efeito", formula: "8d6" })).toBe("Efeito");
  });
});
