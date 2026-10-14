import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";

export interface ZipExtractionLimits {
  maxEntries: number;
  maxTotalUncompressedBytes: number;
}

export class ZipExtractionError extends Error {
  constructor(publicMessage: string) {
    super(publicMessage);
    this.name = "ZipExtractionError";
  }
}

const SYMLINK_FILE_TYPE = 0o120000;
const FILE_TYPE_MASK = 0o170000;

function openZip(zipPath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true, strictFileNames: false, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new ZipExtractionError("Zip inválido"));
      else resolve(zipFile);
    });
  });
}

function openEntryStream(zipFile: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new ZipExtractionError("Entrada ilegível no zip"));
      else resolve(stream);
    });
  });
}

function resolveSafeEntryPath(destinationRoot: string, entryName: string): string {
  const normalizedName = entryName.replace(/\\/g, "/");
  if (normalizedName.includes("\0") || path.isAbsolute(normalizedName) || /^[A-Za-z]:/.test(normalizedName)) {
    throw new ZipExtractionError("Zip contém caminho absoluto");
  }
  const targetPath = path.resolve(destinationRoot, normalizedName);
  if (targetPath !== destinationRoot && !targetPath.startsWith(destinationRoot + path.sep)) {
    throw new ZipExtractionError("Zip tenta escrever fora da pasta do pacote");
  }
  return targetPath;
}

export async function listZipEntryNames(zipPath: string, limits: ZipExtractionLimits): Promise<string[]> {
  const zipFile = await openZip(zipPath);
  if (zipFile.entryCount > limits.maxEntries) {
    zipFile.close();
    throw new ZipExtractionError("Zip com arquivos demais");
  }
  return new Promise((resolve, reject) => {
    const entryNames: string[] = [];
    zipFile.on("entry", (entry: Entry) => {
      entryNames.push(entry.fileName.replace(/\\/g, "/"));
      zipFile.readEntry();
    });
    zipFile.on("end", () => resolve(entryNames));
    zipFile.on("error", reject);
    zipFile.readEntry();
  });
}

export async function extractZipSafely(zipPath: string, destinationRoot: string, stripPrefix: string, limits: ZipExtractionLimits): Promise<void> {
  const resolvedRoot = path.resolve(destinationRoot);
  await mkdir(resolvedRoot, { recursive: true });
  const zipFile = await openZip(zipPath);
  if (zipFile.entryCount > limits.maxEntries) {
    zipFile.close();
    throw new ZipExtractionError("Zip com arquivos demais");
  }

  let totalUncompressedBytes = 0;
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      zipFile.close();
      reject(error);
    };
    zipFile.on("error", fail);
    zipFile.on("end", () => resolve());
    zipFile.on("entry", (entry: Entry) => {
      const handleEntry = async () => {
        const entryName = entry.fileName.replace(/\\/g, "/");
        if (!entryName.startsWith(stripPrefix)) return;
        const relativeName = entryName.slice(stripPrefix.length);
        if (!relativeName) return;

        const fileType = (entry.externalFileAttributes >>> 16) & FILE_TYPE_MASK;
        if (fileType === SYMLINK_FILE_TYPE) return;

        const targetPath = resolveSafeEntryPath(resolvedRoot, relativeName);
        if (relativeName.endsWith("/")) {
          await mkdir(targetPath, { recursive: true });
          return;
        }
        totalUncompressedBytes += entry.uncompressedSize;
        if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) throw new ZipExtractionError("Conteúdo descompactado grande demais");
        await mkdir(path.dirname(targetPath), { recursive: true });
        await pipeline(await openEntryStream(zipFile, entry), createWriteStream(targetPath));
      };
      handleEntry().then(() => zipFile.readEntry(), fail);
    });
    zipFile.readEntry();
  });
}
