// Collects the Portuguese interface text of the app and reports what the en/es catalogs still lack.
// Usage: node scripts/i18n/extract.mjs [--write-missing <file>] [--check]
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "rolldown/parseAst";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE_DIRS = ["apps/client/src", "apps/client/index.html", "apps/server/src", "apps/desktop/src", "packages/api/src", "packages/protocol/src"];
const CATALOG_DIR = path.join(root, "packages/i18n/catalogs");
const SKIPPED_CALLEES = new Set(["console", "logger", "log", "require", "import", "querySelector", "querySelectorAll", "closest", "addEventListener", "removeEventListener", "getElementById", "setAttribute", "getAttribute", "hasAttribute", "removeAttribute", "createElement", "on", "off", "once", "emit", "callAll", "call", "register", "get", "set", "getFlag", "setFlag", "unsetFlag", "matches", "toggleAttribute", "dispatchEvent", "split", "join", "replace", "startsWith", "endsWith", "includes", "toLocaleLowerCase", "localeCompare", "fetch", "describe", "it", "test", "expect"]);
const SKIPPED_PROPERTY_KEYS = new Set(["class", "className", "type", "id", "role", "src", "href", "action", "icon", "tag", "method", "key", "scope", "namespace", "event", "style", "inputmode", "autocomplete", "data-help", "data-action", "data-tab", "lang", "kind", "mode", "rel", "target", "accept", "pattern", "sort", "documentName", "collection", "contentTag", "template", "hook", "path", "url", "format", "image", "img", "color", "default"]);

const TRANSLATED_ATTRIBUTES = new Set(["title", "aria-label", "placeholder", "alt", "aria-description", "data-tooltip"]);

/** Lowercase single words look like code keys, so the ones shown on screen are listed by hand. */
const LOWERCASE_INTERFACE_WORDS = new Set(["ou"]);

async function listFiles(entry) {
  const absolute = path.join(root, entry);
  if (entry.endsWith(".html")) return [absolute];
  const found = [];
  for (const item of await readdir(absolute, { withFileTypes: true, recursive: true })) {
    if (!item.isFile()) continue;
    const file = path.join(item.parentPath ?? item.path, item.name);
    if (/\.test\.ts$|\.d\.ts$/.test(file)) continue;
    if (/\.(ts|html)$/.test(file)) found.push(file);
  }
  return found;
}

/** Interface text, not code: words with spaces, a capital letter or accents, and nothing that looks like a class list, path or key. */
export function looksLikeInterfaceText(text) {
  const trimmed = text.trim();
  if (LOWERCASE_INTERFACE_WORDS.has(trimmed)) return true;
  if (trimmed.length < 2 || trimmed.length > 600) return false;
  if (!/\p{L}/u.test(trimmed)) return false;
  if (/^(https?:|data:|\.{0,2}\/|[#.]?[a-z][\w-]*\[)/.test(trimmed)) return false;
  if (/\bfa-(solid|regular|brands)\b|^fa-/.test(trimmed)) return false;
  if (/[<>{};=]|=>|\$\{/.test(trimmed) && !/\{\d+\}/.test(trimmed)) return false;
  const hasAccent = /[À-ÿ]/.test(trimmed);
  const hasSpace = /\s/.test(trimmed);
  const startsUpper = /^[\p{Lu}¿¡]/u.test(trimmed);
  if (!hasAccent && !hasSpace && !startsUpper) return false;
  if (!hasAccent && hasSpace && trimmed.split(/\s+/).every((token) => /^[a-z0-9_:.-]+$/.test(token)) && /[-_.:]/.test(trimmed)) return false;
  if (!hasAccent && !hasSpace && /^[A-Z0-9_]+$/.test(trimmed)) return false;
  if (!hasAccent && !hasSpace && /[A-Z].*[a-z].*[A-Z]|[a-z][A-Z]/.test(trimmed)) return false;
  if (/^[\w-]+\.[\w.-]+$/.test(trimmed)) return false;
  if (/^[A-Za-z]+\.\{\d+\}$|^[a-z]+ \{\d+\}$|\d+px\b|^rgba?\(|ÿ|@\{\d+\}|\bfloor\(/.test(trimmed)) return false;
  return true;
}

function calleeName(node) {
  const callee = node?.callee;
  if (!callee) return null;
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression") {
    const objectName = callee.object?.type === "Identifier" ? callee.object.name : callee.object?.property?.name;
    if (objectName === "console" || objectName === "logger") return "console";
    return callee.property?.name ?? null;
  }
  return null;
}

function templatePattern(node) {
  const parts = [];
  node.quasis.forEach((quasi, index) => {
    parts.push(quasi.value.cooked ?? quasi.value.raw);
    if (index < node.expressions.length) parts.push(`{${index}}`);
  });
  return parts.join("");
}

function collectFromAst(ast, add) {
  const visit = (node, parent, parentKey) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, parentKey);
      return;
    }
    if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" || node.type === "TSImportType" || node.type === "TSLiteralType" || node.type === "TSModuleDeclaration") return;
    if (node.type === "ExportNamedDeclaration" && node.source) return;
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const name = calleeName(node);
      const [attribute, value] = node.arguments ?? [];
      if (name === "setAttribute" && TRANSLATED_ATTRIBUTES.has(attribute?.value)) {
        visit(value, node, "arguments");
        return;
      }
      if (name && SKIPPED_CALLEES.has(name)) {
        visit(node.callee, node, "callee");
        return;
      }
    }
    if (node.type === "Property" && !node.computed) {
      const key = node.key?.name ?? node.key?.value;
      if (SKIPPED_PROPERTY_KEYS.has(key)) return;
    }
    if (node.type === "Literal" && typeof node.value === "string") {
      if (parent?.type === "Property" && parentKey === "key") return;
      add(node.value);
      return;
    }
    if (node.type === "TemplateLiteral") {
      if (parent?.type === "TaggedTemplateExpression") return;
      add(templatePattern(node));
      for (const expression of node.expressions) visit(expression, node, "expressions");
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent" || key === "start" || key === "end" || key === "range" || key === "loc") continue;
      if (value && typeof value === "object") visit(value, node, key);
    }
  };
  visit(ast, null, null);
}

function collectFromHtml(source, add) {
  const withoutScripts = source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  for (const match of withoutScripts.matchAll(/>([^<>]+)</g)) add(match[1]);
  for (const match of withoutScripts.matchAll(/\s(?:title|aria-label|placeholder|alt)="([^"]+)"/g)) add(match[1]);
}

/** Text nodes are translated one at a time, so a string with markup is split the same way the browser splits it. */
function fragments(text) {
  if (!/<\/?[a-z][^>]*>/i.test(text)) return [text];
  return text
    .split(/<[^>]+>/)
    .map((piece) => piece.replace(/&nbsp;/g, " "))
    .filter((piece) => piece.trim());
}

export async function extractInterfaceStrings() {
  const strings = new Map();
  const add = (file) => (raw) => {
    for (const piece of fragments(String(raw))) {
      const text = piece.replace(/\s+/g, " ").trim();
      if (!looksLikeInterfaceText(text)) continue;
      if (!strings.has(text)) strings.set(text, path.relative(root, file).replace(/\\/g, "/"));
    }
  };
  for (const entry of SOURCE_DIRS) {
    for (const file of await listFiles(entry)) {
      const source = await readFile(file, "utf8");
      if (file.endsWith(".html")) collectFromHtml(source, add(file));
      else collectFromAst(parseAst(source, { lang: "ts" }), add(file));
    }
  }
  return strings;
}

async function readCatalog(language) {
  try {
    return JSON.parse(await readFile(path.join(CATALOG_DIR, `${language}.json`), "utf8"));
  } catch {
    return {};
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const strings = await extractInterfaceStrings();
  const [en, es] = await Promise.all([readCatalog("en"), readCatalog("es")]);
  const missing = [...strings.keys()].filter((text) => !(text in en) || !(text in es));
  console.log(`${strings.size} textos de interface, ${missing.length} sem tradução.`);
  const outputIndex = process.argv.indexOf("--write-missing");
  if (outputIndex > 0) {
    const output = Object.fromEntries(missing.map((text) => [text, strings.get(text)]));
    await writeFile(process.argv[outputIndex + 1], JSON.stringify(output, null, 2), "utf8");
  }
  if (process.argv.includes("--check") && missing.length > 0) {
    for (const text of missing.slice(0, 20)) console.log(`  - ${text}`);
    process.exitCode = 1;
  }
}
