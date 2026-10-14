import type { PackageRecord } from "@tabbletop/protocol";
import { compatibilityMonitor } from "./compatibility/CompatibilityMonitor";
import { currentUi } from "./runtime";

export interface PackageLoadFailure {
  packageId: string;
  asset: string;
  error: unknown;
}

function assetUrl(packageRecord: PackageRecord, relativePath: string): string {
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `/${packageRecord.type}s/${encodeURIComponent(packageRecord.id)}/${encodedPath}`;
}

function appendStylesheet(href: string): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.packageAsset = "true";
  document.head.append(link);
}

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.append(script);
  });
}

/** Loads styles, classic scripts and ES modules in manifest order: system first, then modules by dependency. */
export async function loadPackageAssets(packages: PackageRecord[]): Promise<PackageLoadFailure[]> {
  const failures: PackageLoadFailure[] = [];
  for (const packageRecord of packages) {
    for (const style of packageRecord.styles) appendStylesheet(assetUrl(packageRecord, style));
  }

  for (const packageRecord of packages) {
    for (const script of packageRecord.scripts) {
      await loadClassicScript(assetUrl(packageRecord, script)).catch((error) => failures.push({ packageId: packageRecord.id, asset: script, error }));
    }
    for (const esmodule of packageRecord.esmodules) {
      await import(/* @vite-ignore */ assetUrl(packageRecord, esmodule)).catch((error) => failures.push({ packageId: packageRecord.id, asset: esmodule, error }));
    }
  }

  for (const failure of failures) {
    compatibilityMonitor.recordLoadFailure(failure.packageId, failure.asset, failure.error);
    console.error(`MimicDice | Failed to load ${failure.packageId}/${failure.asset}`, failure.error);
    currentUi()?.notifications?.error(`Falha ao carregar ${failure.packageId}. Veja o console (F12).`);
  }
  return failures;
}
