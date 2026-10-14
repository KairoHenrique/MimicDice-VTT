import { describe, expect, it } from "vitest";
import en from "../catalogs/en.json";
import es from "../catalogs/es.json";
import { Translator } from "./Translator.js";

const placeholders = (text: string) => [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort().join(",");

describe.each([
  ["en", en as Record<string, string>],
  ["es", es as Record<string, string>],
])("catalog %s", (_language, catalog) => {
  it("has a translation for every source text, with the same placeholders", () => {
    expect(Object.keys(catalog).length).toBeGreaterThan(1000);
    for (const [source, translation] of Object.entries(catalog)) {
      expect(typeof translation, source).toBe("string");
      expect(translation.trim(), source).not.toBe("");
      expect(placeholders(translation), source).toBe(placeholders(source));
    }
  });

  it("matches both catalogs key for key", () => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
  });
});

describe("real interface text", () => {
  const english = new Translator(en);
  const spanish = new Translator(es);

  it("translates the main screens", () => {
    for (const text of ["Entrar", "Salvar", "Cancelar", "Configurações"]) expect(english.translate(text), text).not.toBeNull();
    expect(spanish.translate("Configurações")).toBe("Configuración");
    expect(english.translate("Turno 2")).toBe("Round 2");
    expect(spanish.translate("Salvar")).toBe("Guardar");
  });
});
