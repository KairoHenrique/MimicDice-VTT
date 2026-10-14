export type FileKind = "folder" | "image" | "audio" | "video" | "text" | "pdf" | "archive" | "document" | "other";

const EXTENSION_KINDS: Readonly<Record<string, FileKind>> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", bmp: "image", svg: "image",
  mp3: "audio", ogg: "audio", wav: "audio", flac: "audio", m4a: "audio",
  mp4: "video", webm: "video",
  txt: "text", md: "text", json: "text", csv: "text", log: "text",
  pdf: "pdf",
  zip: "archive", rar: "archive", "7z": "archive",
  doc: "document", docx: "document", odt: "document", xls: "document", xlsx: "document", ppt: "document", pptx: "document",
};

const KIND_ICONS: Readonly<Record<FileKind, string>> = {
  folder: "fa-solid fa-folder",
  image: "fa-solid fa-image",
  audio: "fa-solid fa-music",
  video: "fa-solid fa-film",
  text: "fa-solid fa-file-lines",
  pdf: "fa-solid fa-file-pdf",
  archive: "fa-solid fa-file-zipper",
  document: "fa-solid fa-file-word",
  other: "fa-solid fa-file",
};

export const KIND_LABELS: Readonly<Record<FileKind, string>> = {
  folder: "Pasta",
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  text: "Texto",
  pdf: "PDF",
  archive: "Compactado",
  document: "Documento",
  other: "Arquivo",
};

export function fileKindOf(name: string, isFolder: boolean): FileKind {
  if (isFolder) return "folder";
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return EXTENSION_KINDS[extension] ?? "other";
}

export function iconFor(kind: FileKind): string {
  return KIND_ICONS[kind];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
