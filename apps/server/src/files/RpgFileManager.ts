import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RpgEntry, RpgFolderTreeNode } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { isSafeEntryName, toSafeEntryName } from "./safeEntryName";

export const MAX_RPG_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_PATH_DEPTH = 16;
const MAX_LISTED_ENTRIES = 5000;
const MAX_TREE_FOLDERS = 2000;
const MAX_TEXT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_NAME_ATTEMPTS = 500;

/** Splits a client path ("Mapas/Cidade") into validated segments; rejects traversal and hidden names. */
export function parseRpgPath(relativePath: string): string[] {
  const segments = relativePath.replace(/\\/g, "/").split("/").filter((segment) => segment.length > 0);
  if (segments.length > MAX_PATH_DEPTH) throw HttpError.badRequest("Caminho muito longo");
  for (const segment of segments) {
    if (segment === "." || segment === ".." || segment.startsWith(".") || !isSafeEntryName(segment)) throw HttpError.badRequest("Caminho inválido");
  }
  return segments;
}

function requireSafeName(requested: string): string {
  const name = toSafeEntryName(requested);
  if (!name || name.startsWith(".")) throw HttpError.badRequest("Nome inválido");
  return name;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

function byFoldersThenName(left: RpgEntry, right: RpgEntry): number {
  if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
  return left.name.localeCompare(right.name, "pt-BR", { numeric: true, sensitivity: "base" });
}

function createSizeLimiter(maxBytes: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) callback(new HttpError(413, "Arquivo grande demais"));
      else callback(null, chunk);
    },
  });
}

/**
 * File operations confined to one world's `rpgs/<world>` folder. Every path is resolved and checked against the
 * root (including symlink targets) before touching the disk.
 */
export class RpgFileManager {
  constructor(private readonly rootDirectory: string) {}

  async list(relativePath: string): Promise<{ path: string; entries: RpgEntry[] }> {
    const segments = parseRpgPath(relativePath);
    const directory = await this.#resolveExisting(segments, "folder");
    const prefix = segments.join("/");
    const dirents = (await readdir(directory, { withFileTypes: true })).slice(0, MAX_LISTED_ENTRIES);
    const entries = await Promise.all(
      dirents
        .filter((dirent) => !dirent.name.startsWith(".") && isSafeEntryName(dirent.name) && (dirent.isDirectory() || dirent.isFile()))
        .map(async (dirent): Promise<RpgEntry> => {
          const details = await stat(path.join(directory, dirent.name));
          const entryPath = prefix ? `${prefix}/${dirent.name}` : dirent.name;
          return { name: dirent.name, path: entryPath, kind: dirent.isDirectory() ? "folder" : "file", size: dirent.isDirectory() ? 0 : details.size, modified: details.mtimeMs };
        }),
    );
    return { path: prefix, entries: entries.sort(byFoldersThenName) };
  }

  /** Every folder, for the "move to" picker. Bounded so a huge tree cannot exhaust memory. */
  async folderTree(): Promise<RpgFolderTreeNode> {
    const root: RpgFolderTreeNode = { path: "", name: "", children: [] };
    const queue: Array<{ node: RpgFolderTreeNode; directory: string }> = [{ node: root, directory: this.rootDirectory }];
    let visited = 0;
    while (queue.length > 0 && visited < MAX_TREE_FOLDERS) {
      const { node, directory } = queue.shift()!;
      for (const dirent of await readdir(directory, { withFileTypes: true })) {
        if (!dirent.isDirectory() || dirent.name.startsWith(".") || !isSafeEntryName(dirent.name)) continue;
        const child: RpgFolderTreeNode = { path: node.path ? `${node.path}/${dirent.name}` : dirent.name, name: dirent.name, children: [] };
        node.children.push(child);
        queue.push({ node: child, directory: path.join(directory, dirent.name) });
        visited += 1;
      }
      node.children.sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { numeric: true }));
    }
    return root;
  }

  async createFolder(parentPath: string, requestedName: string): Promise<string> {
    const parentSegments = parseRpgPath(parentPath);
    const parent = await this.#resolveExisting(parentSegments, "folder");
    const name = requireSafeName(requestedName);
    if (await pathExists(path.join(parent, name))) throw HttpError.conflict("Já existe algo com esse nome aqui");
    await mkdir(path.join(parent, name));
    return [...parentSegments, name].join("/");
  }

  /** Streams the upload to a temporary file, then renames it; an existing name gets a " (2)" style suffix. */
  async upload(parentPath: string, requestedName: string, content: Readable): Promise<string> {
    const parentSegments = parseRpgPath(parentPath);
    const parent = await this.#resolveExisting(parentSegments, "folder");
    const name = await this.#availableName(parent, requireSafeName(requestedName));
    const finalPath = path.join(parent, name);
    const partialPath = path.join(parent, `.${randomBytes(8).toString("hex")}.part`);
    try {
      await pipeline(content, createSizeLimiter(MAX_RPG_UPLOAD_BYTES), createWriteStream(partialPath, { flags: "wx" }));
      await rename(partialPath, finalPath);
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }
    return [...parentSegments, name].join("/");
  }

  async rename(entryPath: string, requestedName: string): Promise<string> {
    const segments = parseRpgPath(entryPath);
    const source = await this.#resolveExisting(segments);
    const name = requireSafeName(requestedName);
    const parentSegments = segments.slice(0, -1);
    if (name === segments.at(-1)) return segments.join("/");
    const destination = path.join(path.dirname(source), name);
    const isCaseOnlyChange = name.toLowerCase() === segments.at(-1)?.toLowerCase();
    if (!isCaseOnlyChange && (await pathExists(destination))) throw HttpError.conflict("Já existe algo com esse nome aqui");
    await rename(source, destination);
    return [...parentSegments, name].join("/");
  }

  async move(entryPath: string, destinationFolder: string): Promise<string> {
    const segments = parseRpgPath(entryPath);
    const destinationSegments = parseRpgPath(destinationFolder);
    if (segments.length === 0) throw HttpError.badRequest("Não é possível mover a pasta principal");
    const isIntoItself = destinationSegments.length >= segments.length && segments.every((segment, index) => destinationSegments[index] === segment);
    if (isIntoItself) throw HttpError.badRequest("Não dá para mover uma pasta para dentro dela mesma");
    const source = await this.#resolveExisting(segments);
    const destinationDirectory = await this.#resolveExisting(destinationSegments, "folder");
    const name = segments.at(-1) as string;
    if (path.dirname(source) === destinationDirectory) return segments.join("/");
    if (await pathExists(path.join(destinationDirectory, name))) throw HttpError.conflict("O destino já tem algo com esse nome");
    try {
      await rename(source, path.join(destinationDirectory, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      await cp(source, path.join(destinationDirectory, name), { recursive: true, errorOnExist: true });
      await rm(source, { recursive: true });
    }
    return [...destinationSegments, name].join("/");
  }

  async remove(entryPath: string): Promise<void> {
    const segments = parseRpgPath(entryPath);
    if (segments.length === 0) throw HttpError.badRequest("A pasta principal não pode ser apagada");
    await rm(await this.#resolveExisting(segments), { recursive: true });
  }

  /** Location of a file for streaming to the browser, as a root plus a path relative to it. */
  async resolveFile(entryPath: string): Promise<{ root: string; relativePath: string; absolutePath: string; name: string }> {
    const segments = parseRpgPath(entryPath);
    const absolutePath = await this.#resolveExisting(segments, "file");
    const root = await realpath(this.rootDirectory);
    return { root, relativePath: path.relative(root, absolutePath), absolutePath, name: segments.at(-1) ?? "" };
  }

  async readText(entryPath: string): Promise<string> {
    const { absolutePath } = await this.resolveFile(entryPath);
    if ((await stat(absolutePath)).size > MAX_TEXT_FILE_BYTES) throw HttpError.badRequest("Arquivo grande demais para editar aqui");
    return readFile(absolutePath, "utf8");
  }

  async writeText(entryPath: string, content: string): Promise<void> {
    const segments = parseRpgPath(entryPath);
    const parent = await this.#resolveExisting(segments.slice(0, -1), "folder");
    const name = segments.at(-1);
    if (!name) throw HttpError.badRequest("Caminho inválido");
    const target = path.join(parent, name);
    if ((await pathExists(target)) && !(await lstat(target)).isFile()) throw HttpError.badRequest("Não é um arquivo");
    const partialPath = path.join(parent, `.${randomBytes(8).toString("hex")}.part`);
    await writeFile(partialPath, content, { encoding: "utf8", flag: "wx" });
    await rename(partialPath, target);
  }

  async #availableName(directory: string, desiredName: string): Promise<string> {
    if (!(await pathExists(path.join(directory, desiredName)))) return desiredName;
    const extension = path.extname(desiredName);
    const base = desiredName.slice(0, desiredName.length - extension.length);
    for (let suffix = 2; suffix < MAX_NAME_ATTEMPTS; suffix += 1) {
      const candidate = `${base} (${suffix})${extension}`;
      if (!(await pathExists(path.join(directory, candidate)))) return candidate;
    }
    throw HttpError.conflict("Nomes demais iguais nesta pasta");
  }

  /** Resolves inside the root, refusing symlinks and anything whose real path escapes the root. */
  async #resolveExisting(segments: readonly string[], expected?: "file" | "folder"): Promise<string> {
    await mkdir(this.rootDirectory, { recursive: true });
    const realRoot = await realpath(this.rootDirectory);
    const candidate = path.resolve(realRoot, ...segments);
    if (candidate !== realRoot && !candidate.startsWith(realRoot + path.sep)) throw HttpError.badRequest("Caminho inválido");
    let details;
    try {
      details = await lstat(candidate);
    } catch {
      throw HttpError.notFound("Arquivo ou pasta não encontrado");
    }
    if (details.isSymbolicLink()) throw HttpError.forbidden("Atalhos não são permitidos");
    const realCandidate = await realpath(candidate);
    if (realCandidate !== realRoot && !realCandidate.startsWith(realRoot + path.sep)) throw HttpError.badRequest("Caminho inválido");
    if (expected === "folder" && !details.isDirectory()) throw HttpError.badRequest("Não é uma pasta");
    if (expected === "file" && !details.isFile()) throw HttpError.badRequest("Não é um arquivo");
    return candidate;
  }
}
