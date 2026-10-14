import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackageRecord } from "@tabbletop/protocol";
import { translateInterfacePhrase } from "./interfaceGlossary";
import { Localization } from "./Localization";
import { pickLanguageEntries } from "./packageLanguages";

function packageWith(id: string, languages: string[]): PackageRecord {
  return { id, type: "module", languages: languages.map((lang) => ({ lang, name: lang, path: `lang/${lang}.json` })) } as unknown as PackageRecord;
}

function serveFiles(files: Record<string, unknown>): void {
  vi.stubGlobal("fetch", async (url: string) => {
    const body = files[url];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("pickLanguageEntries", () => {
  const entries = [{ lang: "en" }, { lang: "pt-PT" }, { lang: "pt" }];

  it("prefers the exact language, then the bare base language", () => {
    expect(pickLanguageEntries([...entries, { lang: "pt-BR" }], "pt-BR")).toEqual([{ lang: "pt-BR" }]);
    expect(pickLanguageEntries(entries, "pt-BR")).toEqual([{ lang: "pt" }]);
  });

  it("accepts another region of the same language and lowercase codes", () => {
    expect(pickLanguageEntries([{ lang: "en" }, { lang: "pt-PT" }], "pt-BR")).toEqual([{ lang: "pt-PT" }]);
    expect(pickLanguageEntries([{ lang: "pt-br" }], "pt-BR")).toEqual([{ lang: "pt-br" }]);
    expect(pickLanguageEntries([{ lang: "en" }], "pt-BR")).toEqual([]);
  });
});

describe("translateInterfacePhrase", () => {
  it("translates whole known phrases keeping case and trailing punctuation", () => {
    expect(translateInterfacePhrase("Save Changes", "pt-BR")).toBe("Salvar alterações");
    expect(translateInterfacePhrase("DELETE", "pt-BR")).toBe("EXCLUIR");
    expect(translateInterfacePhrase("Name:", "pt-BR")).toBe("Nome:");
  });

  it("leaves unknown sentences and other languages alone", () => {
    expect(translateInterfacePhrase("Delete the goblin now", "pt-BR")).toBeNull();
    expect(translateInterfacePhrase("Delete", "fr")).toBeNull();
  });
});

describe("Localization automatic translation", () => {
  it("uses the package's own translation, then the bundled pack, then the glossary, then English", async () => {
    serveFiles({
      "/modules/mod/lang/en.json": { MOD: { Own: "Own", Pack: "Item template has been deleted", Word: "Delete", Raw: "Something odd" } },
      "/modules/mod/lang/pt.json": { MOD: { Own: "Própria" } },
      "/translations/pt-BR/custom-system-builder.json": { MOD: { Pack: "Do pacote" } },
    });
    const localization = new Localization("pt-BR");
    await localization.initialize([packageWith("mod", ["en", "pt"]), packageWith("custom-system-builder", ["en"])]);
    expect(localization.localize("MOD.Own")).toBe("Própria");
    expect(localization.localize("MOD.Pack")).toBe("Do pacote");
    expect(localization.localize("MOD.Word")).toBe("Excluir");
    expect(localization.localize("MOD.Raw")).toBe("Something odd");
    expect(localization.localize("MOD.Missing")).toBe("MOD.Missing");
  });

  it("does not translate when the table language is English", async () => {
    serveFiles({ "/modules/mod/lang/en.json": { MOD: { Word: "Delete" } } });
    const localization = new Localization("en");
    await localization.initialize([packageWith("mod", ["en"])]);
    expect(localization.localize("MOD.Word")).toBe("Delete");
  });
});
