import { DomTranslator } from "./DomTranslator";
import { type AppLanguage, SOURCE_LANGUAGE } from "./languages";
import { type Catalog, Translator } from "./Translator";

export * from "./languages";
export { DomTranslator } from "./DomTranslator";
export { type Catalog, normalizeText, Translator } from "./Translator";

/** Catalogs load on demand, so Portuguese users never download them. */
export async function loadCatalog(language: AppLanguage): Promise<Catalog> {
  if (language === "en") return (await import("../catalogs/en.json")).default as Catalog;
  if (language === "es") return (await import("../catalogs/es.json")).default as Catalog;
  return {};
}

let activeTranslator: Translator | null = null;

/** Text built outside the page (confirm boxes, canvas labels) goes through here; the page itself is translated live. */
export function t(text: string): string {
  return activeTranslator?.t(text) ?? text;
}

/** Translates the whole page from now on; does nothing in Portuguese, the language the interface is written in. */
export async function translatePage(language: AppLanguage, root: Node = document.documentElement): Promise<DomTranslator | null> {
  document.documentElement.lang = language;
  if (language === SOURCE_LANGUAGE) return null;
  activeTranslator = new Translator(await loadCatalog(language));
  const translator = new DomTranslator(activeTranslator, root);
  translator.start();
  return translator;
}
