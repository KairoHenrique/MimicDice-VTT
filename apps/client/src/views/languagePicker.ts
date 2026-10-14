import { APP_LANGUAGES, isAppLanguage, LANGUAGE_NAMES } from "@tabbletop/i18n";
import { LANGUAGE_STORAGE_KEY, readPreferredLanguage } from "../game/languagePreference";
import { h } from "./dom";

/** Lets someone switch language before logging in; the same choice as the in-game "Idioma" setting. */
export function languagePicker(): HTMLElement {
  const current = readPreferredLanguage();
  const select = h(
    "select",
    { "aria-label": "Idioma" },
    ...APP_LANGUAGES.map((language) => h("option", { value: language, selected: language === current, lang: language, translate: "no" }, LANGUAGE_NAMES[language])),
  );
  select.addEventListener("change", () => {
    if (!isAppLanguage(select.value)) return;
    localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(select.value));
    window.location.reload();
  });
  return h("label", { class: "entry-language" }, h("i", { class: "fa-solid fa-language", "aria-hidden": "true" }), select);
}
