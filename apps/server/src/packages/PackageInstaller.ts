import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { PackageType } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { Logger } from "../logging/logger";
import { manifestFileNameFor, parsePackageManifest, type ParsedPackageManifest } from "./packageManifest";
import type { PackageRegistry } from "./PackageRegistry";
import { DownloadError, downloadJson, downloadToFile } from "./safeDownload";
import { extractZipSafely, listZipEntryNames, ZipExtractionError, type ZipExtractionLimits } from "./zipExtraction";

const SUPPORTED_CORE_GENERATION = 13;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const ZIP_LIMITS: ZipExtractionLimits = { maxEntries: 20_000, maxTotalUncompressedBytes: 1024 * 1024 * 1024 };

export interface PackageInstallerPaths {
  modulesPath: string;
  systemsPath: string;
  temporaryPath: string;
}

export class PackageInstaller {
  readonly #installsInProgress = new Set<string>();

  constructor(
    private readonly paths: PackageInstallerPaths,
    private readonly registry: PackageRegistry,
    private readonly logger: Logger,
  ) {}

  async install(manifestUrl: string, packageType: PackageType): Promise<ParsedPackageManifest> {
    try {
      const remoteManifest = parsePackageManifest(await downloadJson(manifestUrl, MAX_MANIFEST_BYTES));
      if (!remoteManifest.downloadUrl) throw HttpError.badRequest("O manifesto não informa o link de download");
      if ((remoteManifest.minimumCoreGeneration ?? 0) > SUPPORTED_CORE_GENERATION) {
        throw HttpError.badRequest(
          `Esta versão de ${remoteManifest.title} exige Foundry v${remoteManifest.minimumCoreGeneration}. Use a Manifest URL da versão para v${SUPPORTED_CORE_GENERATION}.`,
        );
      }
      if (this.#installsInProgress.has(remoteManifest.id)) throw HttpError.conflict("Esse pacote já está sendo instalado");

      this.#installsInProgress.add(remoteManifest.id);
      try {
        const installed = await this.#downloadAndExtract(remoteManifest, packageType);
        await this.registry.refresh();
        this.logger.info("Pacote instalado", { packageType, packageId: installed.id, version: installed.version });
        return installed;
      } finally {
        this.#installsInProgress.delete(remoteManifest.id);
      }
    } catch (error) {
      if (error instanceof DownloadError || error instanceof ZipExtractionError) throw HttpError.badRequest(error.message);
      if (error instanceof HttpError) throw error;
      this.logger.error("Falha ao instalar pacote", error, { packageType });
      throw HttpError.badRequest("Não foi possível instalar o pacote");
    }
  }

  async #downloadAndExtract(remoteManifest: ParsedPackageManifest, packageType: PackageType): Promise<ParsedPackageManifest> {
    const workDirectory = path.join(this.paths.temporaryPath, randomUUID());
    const archivePath = path.join(workDirectory, "package.zip");
    const extractionDirectory = path.join(workDirectory, "extracted");
    await mkdir(workDirectory, { recursive: true });

    try {
      await downloadToFile(remoteManifest.downloadUrl as string, archivePath, MAX_ARCHIVE_BYTES);
      const manifestFileName = manifestFileNameFor(packageType);
      const stripPrefix = findPackageRootPrefix(await listZipEntryNames(archivePath, ZIP_LIMITS), manifestFileName);
      await extractZipSafely(archivePath, extractionDirectory, stripPrefix, ZIP_LIMITS);

      const extractedManifest = parsePackageManifest(JSON.parse(await readFile(path.join(extractionDirectory, manifestFileName), "utf8")));
      if (extractedManifest.id !== remoteManifest.id) throw HttpError.badRequest("O zip contém um pacote diferente do manifesto");

      await this.#replaceInstalledDirectory(packageType, extractedManifest.id, extractionDirectory);
      return extractedManifest;
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  async #replaceInstalledDirectory(packageType: PackageType, packageId: string, sourceDirectory: string): Promise<void> {
    const rootPath = packageType === "system" ? this.paths.systemsPath : this.paths.modulesPath;
    const targetDirectory = path.join(rootPath, packageId);
    const backupDirectory = path.join(this.paths.temporaryPath, `${packageId}-backup-${randomUUID()}`);
    await mkdir(rootPath, { recursive: true });

    await rename(targetDirectory, backupDirectory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    try {
      await rename(sourceDirectory, targetDirectory);
    } catch (error) {
      await rename(backupDirectory, targetDirectory).catch(() => undefined);
      throw error;
    }
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

function findPackageRootPrefix(entryNames: string[], manifestFileName: string): string {
  if (entryNames.includes(manifestFileName)) return "";
  const nestedManifest = entryNames
    .filter((name) => name.endsWith(`/${manifestFileName}`) && name.split("/").length === 2)
    .sort((left, right) => left.length - right.length)[0];
  if (!nestedManifest) throw new ZipExtractionError(`O zip não contém ${manifestFileName}`);
  return nestedManifest.slice(0, nestedManifest.length - manifestFileName.length);
}
