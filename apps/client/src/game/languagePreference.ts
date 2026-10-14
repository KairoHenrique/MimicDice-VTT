import { type AppLanguage, detectLanguage, isAppLanguage } from "@tabbletop/i18n";

export const LANGUAGE_STORAGE_KEY = "core.language";

/** The system language (Portuguese, English or Spanish; English for any other) until the user picks one. */
export function systemLanguage(): AppLanguage {
  return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]);
}

export function readPreferredLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return isAppLanguage(parsed) ? parsed : systemLanguage();
  } catch {
    return systemLanguage();
  }
}
