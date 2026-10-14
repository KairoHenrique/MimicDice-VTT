import { describe, expect, it } from "vitest";
import { sheetTemplateSchema } from "@tabbletop/protocol";
import { allComponents, keyFromLabel, layoutKeys, missingSystemData, readLayout, rollFormulaFor } from "./sheetLayoutRules";
import { SHEET_PRESETS } from "./sheetPresets";

describe("keyFromLabel", () => {
  it("strips accents and spaces into a roll-data key", () => {
    expect(keyFromLabel("Força de Vontade", new Set())).toBe("forca_de_vontade");
    expect(keyFromLabel("2 Mãos!", new Set())).toBe("maos");
  });

  it("falls back and avoids keys already taken", () => {
    expect(keyFromLabel("???", new Set())).toBe("campo");
    expect(keyFromLabel("Vida", new Set(["vida", "vida_2"]))).toBe("vida_3");
  });
});

describe("readLayout", () => {
  it("rejects layouts with unsafe keys or unknown field types", () => {
    const field = { id: "a1", key: "vida", label: "Vida", type: "number" };
    expect(readLayout({ version: 1, sections: [{ id: "s1", title: "A", columns: 2, fields: [field] }] })).not.toBeNull();
    expect(readLayout({ version: 1, sections: [{ id: "s1", title: "A", columns: 2, fields: [{ ...field, key: "__proto__" }] }] })).toBeNull();
    expect(readLayout({ version: 1, sections: [{ id: "s1", title: "A", columns: 2, fields: [{ ...field, type: "script" }] }] })).toBeNull();
    expect(readLayout("<img onerror=alert(1)>")).toBeNull();
  });
});

describe("missingSystemData", () => {
  it("creates initial values without overwriting what the actor already has", () => {
    const layout = readLayout({
      version: 1,
      sections: [
        {
          id: "s1",
          title: "Combate",
          columns: 2,
          fields: [
            { id: "f1", key: "vida", label: "Vida", type: "resource", initial: 12 },
            { id: "f2", key: "defesa", label: "Defesa", type: "number", initial: 14 },
            { id: "f3", key: "ameaca", label: "Ameaça", type: "select", options: ["Comum", "Chefe"] },
            { id: "f4", key: "dano", label: "Dano", type: "roll", formula: "1d6" },
          ],
        },
      ],
    });
    expect(layout).not.toBeNull();
    expect(missingSystemData(layout!, { defesa: 18 })).toEqual({ vida: { value: 12, max: 12 }, ameaca: "Comum" });
  });
});

describe("presets", () => {
  it("are valid templates whose formulas only reference their own components", () => {
    for (const preset of SHEET_PRESETS) {
      expect(sheetTemplateSchema.safeParse(preset).success, preset.id).toBe(true);
      const keys = layoutKeys(preset.layout);
      for (const component of allComponents(preset.layout)) {
        const references = (rollFormulaFor(component) ?? component.formula ?? "").match(/@([a-z0-9_]+)/g) ?? [];
        for (const reference of references) expect(keys.has(reference.slice(1)), `${preset.id}: ${reference}`).toBe(true);
      }
    }
  });
});

describe("legacy migration", () => {
  it("turns sections into a title row plus fields side by side on the 12-column grid", () => {
    const layout = readLayout({
      version: 1,
      sections: [{ id: "s1", title: "Atributos", columns: 3, fields: ["a", "b", "c", "d"].map((key, index) => ({ id: `f${index}`, key, label: key, type: "number" })) }],
    });
    const components = allComponents(layout!);
    expect(components[0]).toMatchObject({ kind: "title", content: "Atributos", x: 0, y: 0, w: 12 });
    expect(components.slice(1).map(({ x, y, w }) => [x, y, w])).toEqual([[0, 1, 4], [4, 1, 4], [8, 1, 4], [0, 3, 4]]);
  });

  it("rejects v2 components that would overflow the grid or lack a key", () => {
    const page = (component: object) => ({ version: 2, pages: [{ id: "p", title: "P", components: [component] }] });
    expect(readLayout(page({ id: "c", kind: "number", key: "vida", x: 10, y: 0, w: 4, h: 1 }))).toBeNull();
    expect(readLayout(page({ id: "c", kind: "number", x: 0, y: 0, w: 4, h: 1 }))).toBeNull();
    expect(readLayout(page({ id: "c", kind: "image", src: "javascript:alert(1)", x: 0, y: 0, w: 4, h: 1 }))).toBeNull();
    expect(readLayout(page({ id: "c", kind: "title", content: "Ok", x: 0, y: 0, w: 12, h: 1 }))).not.toBeNull();
  });
});
