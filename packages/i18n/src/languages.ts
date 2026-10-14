/** Languages the interface ships in; Portuguese is the source text, the others come from catalogs. */
export const APP_LANGUAGES = ["pt-BR", "en", "es"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const SOURCE_LANGUAGE: AppLanguage = "pt-BR";
export const FALLBACK_LANGUAGE: AppLanguage = "en";

export const LANGUAGE_NAMES: Readonly<Record<AppLanguage, string>> = Object.freeze({ "pt-BR": "Português (Brasil)", en: "English", es: "Español" });

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);
}

/** Maps a locale tag (pt-PT, en-US, es-419...) to an app language, or null when it is not one we ship. */
export function appLanguageFor(locale: string): AppLanguage | null {
  const base = locale.trim().toLowerCase().split(/[-_]/)[0];
  if (base === "pt") return "pt-BR";
  if (base === "en") return "en";
  if (base === "es") return "es";
  return null;
}

/** The system's main language when we ship it; any other language (French, German...) gets English. */
export function detectLanguage(preferredLocales: readonly string[]): AppLanguage {
  const primary = preferredLocales.find((locale) => locale.trim().length > 0);
  return (primary && appLanguageFor(primary)) || FALLBACK_LANGUAGE;
}
