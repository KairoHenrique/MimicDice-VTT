import { describe, expect, it } from "vitest";
import { detectLanguage } from "./languages.js";
import { Translator } from "./Translator.js";

const catalog = {
  Salvar: "Save",
  Vida: "HP",
  Envenenado: "Poisoned",
  "Turno {0}": "Round {0}",
  "Aplicar efeito em {0}": "Apply effect to {0}",
  "{0}: perdeu {1} de {2} (agora {3}).": "{0}: lost {1} {2} (now {3}).",
  "Ficha \"{0}\" aplicada em {1} personagem(ns).": "Sheet \"{0}\" applied to {1} character(s).",
  "{0} aplicado em {1}.": "{0} applied to {1}.",
  "age por último": "acts last",
  "não enxerga": "cannot see",
};

describe("Translator", () => {
  const translator = new Translator(catalog);

  it("translates exact strings, ignoring extra whitespace", () => {
    expect(translator.translate("Salvar")).toBe("Save");
    expect(translator.translate("  Salvar \n")).toBe("Save");
    expect(translator.translate("Desconhecido")).toBeNull();
  });

  it("fills patterns and translates what they captured", () => {
    expect(translator.translate("Turno 3")).toBe("Round 3");
    expect(translator.translate("Aplicar efeito em Ana")).toBe("Apply effect to Ana");
    expect(translator.translate("Envenenado aplicado em Ana.")).toBe("Poisoned applied to Ana.");
    expect(translator.translate("Envenenado: perdeu 2 de Vida (agora 6).")).toBe("Poisoned: lost 2 HP (now 6).");
    expect(translator.translate("Ficha \"Combate\" aplicada em 3 personagem(ns).")).toBe("Sheet \"Combate\" applied to 3 character(s).");
  });

  it("keeps generic patterns from swallowing pieces of other sentences", () => {
    const generic = new Translator({ "{0} de {1}": "{0} of {1}", Vida: "HP" });
    expect(generic.translate("2 de Vida")).toBe("2 of HP");
    expect(generic.translate("Envenenado: perdeu 2 de Vida (agora 8).")).toBeNull();
    const moved = new Translator({ "{0}{1} ({2} quadrados)": "{0}{1} ({2} squares)" });
    expect(moved.translate("4,5 m (3 quadrados)")).toBe("4,5 m (3 squares)");
  });

  it("translates comma lists only when every item is known", () => {
    expect(translator.translate("age por último, não enxerga")).toBe("acts last, cannot see");
    expect(translator.translate("age por último, voa")).toBeNull();
  });

  it("leaves numbers and symbols alone", () => {
    expect(translator.translate("12")).toBeNull();
    expect(translator.translate("—")).toBeNull();
  });
});

describe("detectLanguage", () => {
  it("follows the system language and falls back to English", () => {
    expect(detectLanguage(["pt-BR", "en-US"])).toBe("pt-BR");
    expect(detectLanguage(["pt-PT"])).toBe("pt-BR");
    expect(detectLanguage(["es-419", "en"])).toBe("es");
    expect(detectLanguage(["en-GB"])).toBe("en");
    expect(detectLanguage(["fr-FR", "es-ES"])).toBe("en");
    expect(detectLanguage([])).toBe("en");
  });
});
