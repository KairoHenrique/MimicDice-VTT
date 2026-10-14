import { describe, expect, it } from "vitest";
import { describeAbilityChanges } from "./abilityAudit";

const actor = (abilities: unknown[]) => ({ name: "Lyra", flags: { world: { abilities } } });
const ability = (name: string, description = "") => ({ name, description, rolls: [] });

describe("describeAbilityChanges", () => {
  it("lists added, removed and edited abilities", () => {
    const before = actor([ability("Golpe"), ability("Escudo")]);
    const after = actor([ability("Golpe", "agora com fogo"), ability("Bola de fogo")]);
    expect(describeAbilityChanges(before, after)).toEqual(["Adicionou: Bola de fogo", "Removeu: Escudo", "Editou: Golpe"]);
  });

  it("notices a reorder and ignores untouched abilities", () => {
    const before = actor([ability("A"), ability("B")]);
    expect(describeAbilityChanges(before, actor([ability("B"), ability("A")]))).toEqual(["Mudou a ordem das habilidades"]);
    expect(describeAbilityChanges(before, actor([ability("A"), ability("B")]))).toEqual([]);
    expect(describeAbilityChanges({ name: "x" }, { name: "y" })).toEqual([]);
  });
});
