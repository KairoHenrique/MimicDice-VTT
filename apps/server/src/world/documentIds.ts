import { randomInt } from "node:crypto";

const DOCUMENT_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateDocumentId(length = 16): string {
  let identifier = "";
  for (let index = 0; index < length; index += 1) {
    identifier += DOCUMENT_ID_ALPHABET[randomInt(DOCUMENT_ID_ALPHABET.length)];
  }
  return identifier;
}

export function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "mundo";
}
