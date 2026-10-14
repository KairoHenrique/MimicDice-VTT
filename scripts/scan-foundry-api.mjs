#!/usr/bin/env node
/*
 * Lists the Foundry API surface an installed add-on references, so it can be probed against the
 * running Tabbletop client with `game.tabbletop.probeApi(paths)`.
 * Usage: node scripts/scan-foundry-api.mjs <package-directory> [--json]
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FOUNDRY_PATH = /\bfoundry(?:\.[A-Za-z_$][\w$]*)+/g;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "packs", "lang", "assets", "images", "sounds"]);

async function* scriptFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* scriptFiles(fullPath);
    } else if (/\.(m?js)$/i.test(entry.name)) {
      yield fullPath;
    }
  }
}

/** Trims a member chain to the longest prefix that names API, dropping trailing method calls on instances. */
function normalize(reference) {
  return reference.replace(/\.(prototype|call|apply|bind|name|length)$/, "");
}

async function scan(packageDirectory) {
  const references = new Map();
  for await (const file of scriptFiles(packageDirectory)) {
    if ((await stat(file)).size > MAX_FILE_BYTES) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(FOUNDRY_PATH)) {
      const reference = normalize(match[0]);
      references.set(reference, (references.get(reference) ?? 0) + 1);
    }
  }
  return [...references.entries()].sort(([left], [right]) => left.localeCompare(right));
}

const [packageDirectory, flag] = process.argv.slice(2);
if (!packageDirectory) {
  console.error("Usage: node scripts/scan-foundry-api.mjs <package-directory> [--json]");
  process.exit(1);
}
const references = await scan(path.resolve(packageDirectory));
if (flag === "--json") console.log(JSON.stringify(references.map(([reference]) => reference)));
else for (const [reference, count] of references) console.log(`${String(count).padStart(5)}  ${reference}`);
