// Drops catalog entries whose source text is no longer extracted from the app (removed or filtered as code).
// Usage: node scripts/i18n/prune.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractInterfaceStrings } from "./extract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const strings = await extractInterfaceStrings();
for (const language of ["en", "es"]) {
  const file = path.join(root, "packages/i18n/catalogs", `${language}.json`);
  const catalog = JSON.parse(await readFile(file, "utf8"));
  const kept = Object.fromEntries(Object.entries(catalog).filter(([source]) => strings.has(source)));
  await writeFile(file, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
  console.log(`${language}: ${Object.keys(catalog).length - Object.keys(kept).length} removido(s), ${Object.keys(kept).length} mantido(s).`);
}
