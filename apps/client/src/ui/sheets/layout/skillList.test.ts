import { describe, expect, it } from "vitest";
import { readSkillValues, skillPointsTotal, skillsFromLabels, sortSkillsByValue } from "./skillList";

describe("skill list", () => {
  it("turns typed names into keys, skipping blanks and repeats", () => {
    expect(skillsFromLabels(["Acrobacia", "", "  Ciências ", "acrobacia", "Força de Vontade"])).toEqual([
      { key: "acrobacia", label: "Acrobacia" },
      { key: "ciencias", label: "Ciências" },
      { key: "forca_de_vontade", label: "Força de Vontade" },
    ]);
  });

  it("keeps the key of skills that stayed, so stored points do not move", () => {
    const existing = [{ key: "luta", label: "Luta" }, { key: "tiro", label: "Pontaria" }];
    expect(skillsFromLabels(["Pontaria", "Luta Livre", "Luta"], existing)).toEqual([
      { key: "tiro", label: "Pontaria" },
      { key: "luta_livre", label: "Luta Livre" },
      { key: "luta", label: "Luta" },
    ]);
  });

  it("reads stored points and sums them, ignoring bad values", () => {
    const skills = [{ key: "luta", label: "Luta" }, { key: "crime", label: "Crime" }, { key: "artes", label: "Artes" }];
    const values = readSkillValues({ luta: 5, crime: "x", outra: 9 }, skills);
    expect(values).toEqual({ luta: 5, crime: 0, artes: 0 });
    expect(skillPointsTotal(values)).toBe(5);
  });

  it("sorts skills in descending order of points value, tiebreaking alphabetically", () => {
    const skills = [
      { key: "acrobacia", label: "Acrobacia" },
      { key: "luta", label: "Luta" },
      { key: "tiro", label: "Pontaria" },
      { key: "crime", label: "Crime" },
    ];
    const values = { acrobacia: 5, luta: 10, tiro: 0, crime: 5 };
    const sorted = sortSkillsByValue(skills, values);
    expect(sorted.map((s) => s.key)).toEqual(["luta", "acrobacia", "crime", "tiro"]);
  });
});
