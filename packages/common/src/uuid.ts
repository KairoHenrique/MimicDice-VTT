export interface UuidSegment {
  documentName: string;
  documentId: string;
}

const DOCUMENT_NAME_PATTERN = /^[A-Z][A-Za-z]{1,40}$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9]{16}$/;
const MAX_UUID_DEPTH = 4;

/** Parses "Actor.abc.Item.def" into ordered segments; returns null for anything malformed. */
export function parseDocumentUuid(uuid: unknown): UuidSegment[] | null {
  if (typeof uuid !== "string" || uuid.length > 200) return null;
  const parts = uuid.split(".");
  if (parts.length === 0 || parts.length % 2 !== 0 || parts.length / 2 > MAX_UUID_DEPTH) return null;
  const segments: UuidSegment[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const [documentName, documentId] = [parts[index], parts[index + 1]];
    if (!DOCUMENT_NAME_PATTERN.test(documentName) || !DOCUMENT_ID_PATTERN.test(documentId)) return null;
    segments.push({ documentName, documentId });
  }
  return segments;
}

export function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && DOCUMENT_ID_PATTERN.test(value);
}
