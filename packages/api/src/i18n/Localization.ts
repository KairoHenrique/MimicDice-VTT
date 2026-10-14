import type { PackageRecord } from "@tabbletop/protocol";
import { getProperty, mergeObject, type PlainObject } from "@tabbletop/common";
import { CORE_TRANSLATIONS } from "./coreTranslations";
import { translateInterfacePhrase } from "./interfaceGlossary";
import { loadBundledTranslationPacks, pickLanguageEntries } from "./packageLanguages";

const FALLBACK_LANGUAGE = "en";

export class Localization {
  translations: PlainObject = {};
  #fallbackTranslations: PlainObject = {};
  #bundledTranslations: PlainObject = {};
  readonly #autoTranslated = new Map<string, string>();

  constructor(public lang: string = FALLBACK_LANGUAGE) {}

  async initialize(packages: PackageRecord[]): Promise<void> {
    this.#fallbackTranslations = mergeObject({}, CORE_TRANSLATIONS[FALLBACK_LANGUAGE]);
    this.translations = mergeObject({}, CORE_TRANSLATIONS[this.lang] ?? {});
    this.#bundledTranslations = {};
    this.#autoTranslated.clear();

    const translating = this.lang !== FALLBACK_LANGUAGE;
    const [fallbackFiles, languageFiles, bundledFiles] = await Promise.all([
      this.#loadPackageTranslations(packages, FALLBACK_LANGUAGE),
      translating ? this.#loadPackageTranslations(packages, this.lang) : Promise.resolve([]),
      translating ? loadBundledTranslationPacks(packages.map((packageRecord) => packageRecord.id), this.lang) : Promise.resolve([]),
    ]);
    for (const translationFile of fallbackFiles) mergeObject(this.#fallbackTranslations, translationFile);
    for (const translationFile of languageFiles) mergeObject(this.translations, translationFile);
    for (const translationFile of bundledFiles) mergeObject(this.#bundledTranslations, translationFile);
    if (!translating) mergeObject(this.translations, this.#fallbackTranslations);
  }

  has(stringId: string, fallback = true): boolean {
    if (!stringId) return false;
    if (this.#lookup(this.translations, stringId) !== undefined) return true;
    return fallback && this.#lookup(this.#fallbackTranslations, stringId) !== undefined;
  }

  localize(stringId: string): string {
    if (!stringId) return stringId;
    const translated = this.#lookup(this.translations, stringId);
    if (translated !== undefined) return typeof translated === "string" ? translated : stringId;
    const english = this.#lookup(this.#fallbackTranslations, stringId);
    return typeof english === "string" ? this.#autoTranslate(stringId, english) : stringId;
  }

  format(stringId: string, data: Record<string, unknown> = {}): string {
    return this.localize(stringId).replace(/{[^}]+}/g, (placeholder) => {
      const value = data[placeholder.slice(1, -1)];
      return value === undefined || value === null ? placeholder : String(value);
    });
  }

  getListFormatter({ style = "long", type = "conjunction" }: { style?: Intl.ListFormatStyle; type?: Intl.ListFormatType } = {}): Intl.ListFormat {
    return new Intl.ListFormat(this.lang, { style, type });
  }

  sortObjects<T>(objects: T[], key: string): T[] {
    const collator = new Intl.Collator(this.lang);
    return objects.sort((left, right) => collator.compare(String(getProperty(left, key)), String(getProperty(right, key))));
  }

  /** Strings a package left untranslated: bundled pack first, then the interface glossary, else the English text. */
  #autoTranslate(stringId: string, english: string): string {
    const cached = this.#autoTranslated.get(stringId);
    if (cached !== undefined) return cached;
    const bundled = this.#lookup(this.#bundledTranslations, stringId);
    const result = typeof bundled === "string" ? bundled : (translateInterfacePhrase(english, this.lang) ?? english);
    this.#autoTranslated.set(stringId, result);
    return result;
  }

  #lookup(source: PlainObject, stringId: string): unknown {
    return stringId in source ? source[stringId] : getProperty(source, stringId);
  }

  async #loadPackageTranslations(packages: PackageRecord[], language: string): Promise<PlainObject[]> {
    const requests = packages.flatMap((packageRecord) =>
      pickLanguageEntries(packageRecord.languages, language).map(async (languageEntry) => {
        const response = await fetch(`/${packageRecord.type}s/${packageRecord.id}/${languageEntry.path}`, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PlainObject;
      }),
    );
    const results = await Promise.allSettled(requests);
    return results.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];
      console.warn("MimicDice | Failed to load translation file", result.reason);
      return [];
    });
  }
}
