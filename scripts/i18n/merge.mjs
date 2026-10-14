// Merges translation batches ({ "pt text": { en, es } }) into packages/i18n/catalogs, keeping existing entries.
// Usage: node scripts/i18n/merge.mjs <batch.json> [more batches...]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG_DIR = path.join(root, "packages/i18n/catalogs");
const LANGUAGES = ["en", "es"];
const MAX_TEXT_LENGTH = 2000;

export function placeholdersOf(text) {
  return [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort().join(",");
}

/** A translation is usable when it is a non-empty string of sane size with exactly the same {n} placeholders. */
export function validTranslation(source, translation) {
  if (typeof translation !== "string") return false;
  const trimmed = translation.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return false;
  if (/<\s*script|javascript:/i.test(trimmed)) return false;
  return placeholdersOf(source) === placeholdersOf(trimmed);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

function sortedObject(entries) {
  return Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right, "pt-BR")));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const batchFiles = process.argv.slice(2);
  const catalogs = Object.fromEntries(await Promise.all(LANGUAGES.map(async (language) => [language, await readJson(path.join(CATALOG_DIR, `${language}.json`))])));
  const rejected = [];
  for (const batchFile of batchFiles) {
    const batch = await readJson(batchFile);
    for (const [source, translations] of Object.entries(batch)) {
      for (const language of LANGUAGES) {
        const translation = translations?.[language];
        if (validTranslation(source, translation)) catalogs[language][source] = translation.trim();
        else rejected.push(`${language}: ${source}`);
      }
    }
  }
  for (const language of LANGUAGES) {
    await writeFile(path.join(CATALOG_DIR, `${language}.json`), `${JSON.stringify(sortedObject(catalogs[language]), null, 2)}\n`, "utf8");
  }
  console.log(`en: ${Object.keys(catalogs.en).length} | es: ${Object.keys(catalogs.es).length} | rejeitados: ${rejected.length}`);
  for (const line of rejected.slice(0, 40)) console.log(`  - ${line}`);
}
