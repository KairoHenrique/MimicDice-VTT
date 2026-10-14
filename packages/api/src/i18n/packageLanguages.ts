import type { PlainObject } from "@tabbletop/common";

interface LanguageEntry {
  lang: string;
}

/**
 * Picks a package's translation files for a language, accepting close variants when the exact one is missing:
 * `pt-BR` falls back to `pt-br`, then `pt`, then another region of the same language such as `pt-PT`.
 */
export function pickLanguageEntries<T extends LanguageEntry>(entries: readonly T[], language: string): T[] {
  const exact = entries.filter((entry) => entry.lang === language);
  if (exact.length > 0) return exact;
  const wanted = language.toLowerCase();
  const sameCode = entries.filter((entry) => entry.lang.toLowerCase() === wanted);
  if (sameCode.length > 0) return sameCode;
  const baseLanguage = wanted.split("-")[0];
  const bareBase = entries.filter((entry) => entry.lang.toLowerCase() === baseLanguage);
  if (bareBase.length > 0) return bareBase;
  const otherRegion = entries.find((entry) => entry.lang.toLowerCase().split("-")[0] === baseLanguage);
  return otherRegion ? entries.filter((entry) => entry.lang === otherRegion.lang) : [];
}

/** Translations shipped with MimicDice for popular packages that do not include this language themselves. */
const BUNDLED_TRANSLATION_PACKS: Readonly<Record<string, readonly string[]>> = {
  "pt-BR": ["custom-system-builder", "monks-little-details"],
};

export async function loadBundledTranslationPacks(packageIds: readonly string[], language: string): Promise<PlainObject[]> {
  const available = new Set(BUNDLED_TRANSLATION_PACKS[language] ?? []);
  const requests = packageIds
    .filter((packageId) => available.has(packageId))
    .map(async (packageId) => {
      const response = await fetch(`/translations/${language}/${packageId}.json`, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as PlainObject;
    });
  const results = await Promise.allSettled(requests);
  return results.flatMap((result) => (result.status === "fulfilled" && result.value && typeof result.value === "object" ? [result.value] : []));
}
