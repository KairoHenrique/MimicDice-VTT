import type { DocumentTypeDefinition } from "./documentTypes";
import { getProperty, setProperty, type PlainObject } from "./objectUtils";
import { DOCUMENT_OWNERSHIP_LEVELS } from "./permissions";

const SECTION_TAG_PATTERN = /<(\/?)section\b([^>]*)>/gi;
const SECRET_CLASS_PATTERN = /\bclass\s*=\s*(["'])(?:(?!\1).)*\bsecret\b(?:(?!\1).)*\1/i;

/** Removes every `<section class="secret">` block (with nested sections) from sanitized, well-formed HTML. */
export function stripSecretSections(html: string): string {
  if (!html.includes("secret")) return html;
  let output = "";
  let cursor = 0;
  let secretDepth = 0;
  for (const match of html.matchAll(SECTION_TAG_PATTERN)) {
    const isClosing = match[1] === "/";
    const index = match.index ?? 0;
    if (secretDepth === 0) {
      if (isClosing || !SECRET_CLASS_PATTERN.test(match[2] ?? "")) continue;
      output += html.slice(cursor, index);
      secretDepth = 1;
      continue;
    }
    secretDepth += isClosing ? -1 : 1;
    if (secretDepth === 0) cursor = index + match[0].length;
  }
  return secretDepth > 0 ? output : output + html.slice(cursor);
}

/** Owners and GMs see secrets; everyone else receives the HTML fields with secret blocks removed. */
export function redactSecretsForOwnership(definition: DocumentTypeDefinition, data: PlainObject, ownershipLevel: number): PlainObject {
  if (ownershipLevel >= DOCUMENT_OWNERSHIP_LEVELS.OWNER || definition.htmlFields.length === 0) return data;
  for (const fieldPath of definition.htmlFields) {
    if (Object.hasOwn(data, fieldPath)) {
      const flatValue = data[fieldPath];
      if (typeof flatValue === "string") data[fieldPath] = stripSecretSections(flatValue);
      continue;
    }
    const nestedValue = getProperty(data, fieldPath);
    if (typeof nestedValue === "string") setProperty(data, fieldPath, stripSecretSections(nestedValue));
  }
  return data;
}
