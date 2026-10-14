import { randomBytes } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileBrowseResult } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { contentMatchesExtension, isAllowedUploadExtension, uploadExtension } from "./uploadFileTypes";

export const UPLOADS_ROOT = "uploads";
const BROWSABLE_ROOTS: readonly string[] = [UPLOADS_ROOT, "modules", "systems"];
const MAX_LISTED_ENTRIES = 2000;
const MAX_PATH_DEPTH = 12;
const SEGMENT_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/;

/**
 * The FilePicker's view of the data directory: user uploads (read-write) plus installed package folders
 * (read-only). Worlds, configuration and temporary files are never reachable through it.
 */
export class FileStorage {
  readonly #dataPath: string;

  constructor(dataPath: string) {
    this.#dataPath = path.resolve(dataPath);
  }

  get uploadsDirectory(): string {
    return path.join(this.#dataPath, UPLOADS_ROOT);
  }

  async browse(target: string, extensions: ReadonlySet<string> | null): Promise<FileBrowseResult> {
    const segments = parseTarget(target);
    if (segments.length === 0) return { target: "", dirs: [...BROWSABLE_ROOTS], files: [], writable: false };
    return this.listFolder(segments, extensions);
  }

  /** Lists one folder (creating it inside uploads); `segments` must come from `parseTarget`. */
  async listFolder(segments: readonly string[], extensions: ReadonlySet<string> | null): Promise<FileBrowseResult> {
    const directory = this.#resolve(segments);
    if (segments[0] === UPLOADS_ROOT) await mkdir(directory, { recursive: true });
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      throw HttpError.notFound("Pasta não encontrada");
    }
    const prefix = segments.join("/");
    const dirs: string[] = [];
    const files: string[] = [];
    for (const entry of entries.slice(0, MAX_LISTED_ENTRIES)) {
      if (entry.name.startsWith(".") || !SEGMENT_PATTERN.test(entry.name)) continue;
      if (entry.isDirectory()) dirs.push(`${prefix}/${entry.name}`);
      else if (entry.isFile() && (!extensions || extensions.has(`.${uploadExtension(entry.name)}`))) files.push(`${prefix}/${entry.name}`);
    }
    const byName = (first: string, second: string) => first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
    return { target: prefix, dirs: dirs.sort(byName), files: files.sort(byName), writable: segments[0] === UPLOADS_ROOT };
  }

  async isDirectory(segments: readonly string[]): Promise<boolean> {
    try {
      return (await stat(this.#resolve(segments))).isDirectory();
    } catch {
      return false;
    }
  }

  async upload(target: string, requestedName: string, content: Uint8Array): Promise<string> {
    const segments = writableSegments(target);
    const fileName = sanitizeFileName(requestedName);
    const extension = uploadExtension(fileName);
    if (!isAllowedUploadExtension(extension)) throw HttpError.badRequest("Tipo de arquivo não permitido");
    if (content.byteLength === 0 || !contentMatchesExtension(extension, content)) throw HttpError.badRequest("O conteúdo não corresponde ao tipo do arquivo");

    const directory = this.#resolve(segments);
    await mkdir(directory, { recursive: true });
    const finalPath = path.join(directory, fileName);
    const partialPath = `${finalPath}.${randomBytes(6).toString("hex")}.part`;
    try {
      await writeFile(partialPath, content, { flag: "wx" });
      await rename(partialPath, finalPath);
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }
    return [...segments, fileName].join("/");
  }

  async createDirectory(target: string): Promise<string> {
    const segments = writableSegments(target);
    if (segments.length < 2) throw HttpError.badRequest("Informe o nome da nova pasta");
    await mkdir(this.#resolve(segments), { recursive: true });
    return segments.join("/");
  }

  #resolve(segments: readonly string[]): string {
    const rootDirectory = path.join(this.#dataPath, segments[0] as string);
    const resolved = path.resolve(rootDirectory, ...segments.slice(1));
    if (resolved !== rootDirectory && !resolved.startsWith(rootDirectory + path.sep)) throw HttpError.badRequest("Caminho inválido");
    return resolved;
  }
}

function writableSegments(target: string): string[] {
  const segments = parseTarget(target);
  if (segments[0] !== UPLOADS_ROOT) throw HttpError.forbidden("Só é possível enviar arquivos para a pasta uploads");
  return segments;
}

export function parseTarget(target: string): string[] {
  const segments = target.replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0);
  if (segments.length > MAX_PATH_DEPTH) throw HttpError.badRequest("Caminho inválido");
  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.startsWith(".") || !SEGMENT_PATTERN.test(segment)) throw HttpError.badRequest("Caminho inválido");
  }
  if (segments.length > 0 && !BROWSABLE_ROOTS.includes(segments[0] as string)) throw HttpError.forbidden("Pasta fora da área de arquivos");
  return segments;
}

function sanitizeFileName(requestedName: string): string {
  const baseName = requestedName.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.-]+/, "")
    .slice(-120);
  if (!cleaned || !cleaned.includes(".")) throw HttpError.badRequest("Nome de arquivo inválido");
  return cleaned;
}
