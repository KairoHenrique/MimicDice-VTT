type SignatureCheck = (bytes: Uint8Array) => boolean;

function startsWithBytes(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function startsWithAscii(bytes: Uint8Array, text: string, offset = 0): boolean {
  return startsWithBytes(bytes, Array.from(text, (character) => character.charCodeAt(0)), offset);
}

const isRiffOf = (format: string): SignatureCheck => (bytes) => startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes, format, 8);
const isIsoMedia: SignatureCheck = (bytes) => startsWithAscii(bytes, "ftyp", 4);
const isMatroska: SignatureCheck = (bytes) => startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
/** Valid UTF-8 without NUL bytes: a real text file, not a renamed binary. */
export const isPlainText: SignatureCheck = (bytes) => {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

const isSvg: SignatureCheck = (bytes) => {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
};

/**
 * Upload allowlist: extension to content signature. Anything else (scripts, HTML, archives) is refused, so an
 * upload can never become executable content served from the table's origin.
 */
const UPLOAD_SIGNATURES: Readonly<Record<string, SignatureCheck>> = {
  png: (bytes) => startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]),
  jpg: (bytes) => startsWithBytes(bytes, [0xff, 0xd8, 0xff]),
  jpeg: (bytes) => startsWithBytes(bytes, [0xff, 0xd8, 0xff]),
  gif: (bytes) => startsWithAscii(bytes, "GIF8"),
  webp: isRiffOf("WEBP"),
  avif: isIsoMedia,
  svg: isSvg,
  mp3: (bytes) => startsWithAscii(bytes, "ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0),
  ogg: (bytes) => startsWithAscii(bytes, "OggS"),
  oga: (bytes) => startsWithAscii(bytes, "OggS"),
  wav: isRiffOf("WAVE"),
  flac: (bytes) => startsWithAscii(bytes, "fLaC"),
  m4a: isIsoMedia,
  mp4: isIsoMedia,
  webm: isMatroska,
  woff: (bytes) => startsWithAscii(bytes, "wOFF"),
  woff2: (bytes) => startsWithAscii(bytes, "wOF2"),
  ttf: (bytes) => startsWithBytes(bytes, [0x00, 0x01, 0x00, 0x00]),
  otf: (bytes) => startsWithAscii(bytes, "OTTO"),
  pdf: (bytes) => startsWithAscii(bytes, "%PDF-"),
  txt: isPlainText,
  md: isPlainText,
};

export const NOTE_FILE_EXTENSIONS: ReadonlySet<string> = new Set(["md", "txt"]);

export function uploadExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

export function isAllowedUploadExtension(extension: string): boolean {
  return Object.hasOwn(UPLOAD_SIGNATURES, extension);
}

export function contentMatchesExtension(extension: string, bytes: Uint8Array): boolean {
  const check = UPLOAD_SIGNATURES[extension];
  return check !== undefined && check(bytes);
}
