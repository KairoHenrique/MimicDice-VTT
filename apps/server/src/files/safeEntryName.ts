const FORBIDDEN_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
export const MAX_ENTRY_NAME_LENGTH = 120;

/**
 * Turns user text into a single, human-readable file or folder name that is valid on Windows, macOS and Linux,
 * or returns null when nothing usable remains. Accents and spaces are kept on purpose.
 */
export function toSafeEntryName(requested: string): string | null {
  const cleaned = requested
    .normalize("NFC")
    .replace(FORBIDDEN_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, MAX_ENTRY_NAME_LENGTH)
    .trim();
  if (!cleaned || WINDOWS_RESERVED_NAMES.test(cleaned)) return null;
  return cleaned;
}

/** True when `name` is exactly what `toSafeEntryName` would produce, so it can be used as a path segment. */
export function isSafeEntryName(name: string): boolean {
  return toSafeEntryName(name) === name;
}
