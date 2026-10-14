import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PackageRecord, PackageType } from "@tabbletop/protocol";
import type { Logger } from "../logging/logger";
import { manifestFileNameFor, parsePackageManifest, type ParsedPackageManifest } from "./packageManifest";

export interface InstalledPackage extends ParsedPackageManifest {
  type: PackageType;
  directory: string;
}

export class PackageRegistry {
  #modules = new Map<string, InstalledPackage>();
  #systems = new Map<string, InstalledPackage>();

  constructor(
    private readonly modulesPath: string,
    private readonly systemsPath: string,
    private readonly logger: Logger,
  ) {}

  async refresh(): Promise<void> {
    const [modules, systems] = await Promise.all([this.#scan("module", this.modulesPath), this.#scan("system", this.systemsPath)]);
    this.#modules = modules;
    this.#systems = systems;
  }

  find(packageType: PackageType, packageId: string): InstalledPackage | undefined {
    return packageType === "system" ? this.#systems.get(packageId) : this.#modules.get(packageId);
  }

  listModules(): InstalledPackage[] {
    return Array.from(this.#modules.values());
  }

  listSystems(): InstalledPackage[] {
    return Array.from(this.#systems.values());
  }

  resolveModuleLoadOrder(activeModuleIds: ReadonlySet<string>): InstalledPackage[] {
    const ordered: InstalledPackage[] = [];
    const visitState = new Map<string, "visiting" | "done">();

    const visit = (moduleId: string): void => {
      const installedModule = this.#modules.get(moduleId);
      if (!installedModule || !activeModuleIds.has(moduleId) || visitState.get(moduleId) === "done") return;
      if (visitState.get(moduleId) === "visiting") {
        this.logger.warn("Dependência circular entre módulos", { moduleId });
        return;
      }
      visitState.set(moduleId, "visiting");
      for (const dependencyId of installedModule.requiredPackageIds) visit(dependencyId);
      visitState.set(moduleId, "done");
      ordered.push(installedModule);
    };

    for (const moduleId of Array.from(activeModuleIds).sort()) visit(moduleId);
    return ordered;
  }

  async #scan(packageType: PackageType, rootPath: string): Promise<Map<string, InstalledPackage>> {
    await mkdir(rootPath, { recursive: true });
    const directoryEntries = await readdir(rootPath, { withFileTypes: true });
    const packages = await Promise.all(
      directoryEntries.filter((entry) => entry.isDirectory()).map((entry) => this.#readPackage(packageType, path.join(rootPath, entry.name))),
    );
    return new Map(packages.filter((candidate): candidate is InstalledPackage => candidate !== undefined).map((candidate) => [candidate.id, candidate]));
  }

  async #readPackage(packageType: PackageType, directory: string): Promise<InstalledPackage | undefined> {
    const directoryName = path.basename(directory);
    try {
      const rawManifest = JSON.parse(await readFile(path.join(directory, manifestFileNameFor(packageType)), "utf8"));
      const manifest = parsePackageManifest(rawManifest);
      if (manifest.id !== directoryName) {
        this.logger.warn("Pasta do pacote não bate com o id do manifesto", { packageType, directoryName, packageId: manifest.id });
        return undefined;
      }
      return { ...manifest, type: packageType, directory };
    } catch (error) {
      this.logger.warn("Pacote ignorado por manifesto inválido", {
        packageType,
        directoryName,
        reason: error instanceof Error ? error.message.slice(0, 300) : "desconhecido",
      });
      return undefined;
    }
  }
}

export function toPackageRecord(installedPackage: InstalledPackage, active: boolean): PackageRecord {
  return {
    id: installedPackage.id,
    type: installedPackage.type,
    title: installedPackage.title,
    version: installedPackage.version,
    description: installedPackage.description,
    esmodules: installedPackage.esmodules,
    scripts: installedPackage.scripts,
    styles: installedPackage.styles,
    languages: installedPackage.languages,
    active,
    manifestData: installedPackage.manifestData,
  };
}
