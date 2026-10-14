import { z } from "zod";
import { PACKAGE_ID_PATTERN, type PackageType } from "@tabbletop/protocol";

export function isSafeRelativePath(candidate: string): boolean {
  if (candidate.includes("\0") || candidate.includes(":")) return false;
  if (candidate.startsWith("/") || candidate.startsWith("\\")) return false;
  return candidate.split(/[\\/]/).every((segment) => segment !== "..");
}

export function normalizeRelativePath(candidate: string): string {
  return candidate.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

const relativeAssetPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(isSafeRelativePath, "Caminho de arquivo inválido no manifesto")
  .transform(normalizeRelativePath);

/** v13 manifests may list stylesheets as `{ src, layer }` objects instead of plain paths. */
const styleEntrySchema = z.union([relativeAssetPathSchema, z.object({ src: relativeAssetPathSchema }).passthrough().transform((entry) => entry.src)]);

const versionLikeSchema = z.union([z.string().max(64), z.number()]).transform(String);

const relationshipSchema = z.object({ id: z.string().max(64), type: z.string().max(32).optional() }).passthrough();

const relationshipsSchema = z
  .object({
    requires: z.array(relationshipSchema).default([]),
    recommends: z.array(relationshipSchema).default([]),
    systems: z.array(relationshipSchema).default([]),
    conflicts: z.array(relationshipSchema).default([]),
  })
  .partial()
  .passthrough();

const rawManifestSchema = z
  .object({
    id: z.string().regex(PACKAGE_ID_PATTERN).optional(),
    name: z.string().regex(PACKAGE_ID_PATTERN).optional(),
    title: z.string().min(1).max(200),
    description: z.string().max(50_000).default(""),
    version: versionLikeSchema.default("0.0.0"),
    compatibility: z
      .object({ minimum: versionLikeSchema, verified: versionLikeSchema, maximum: versionLikeSchema })
      .partial()
      .passthrough()
      .optional(),
    esmodules: z.array(relativeAssetPathSchema).max(200).default([]),
    scripts: z.array(relativeAssetPathSchema).max(200).default([]),
    styles: z.array(styleEntrySchema).max(200).default([]),
    languages: z
      .array(z.object({ lang: z.string().max(20), name: z.string().max(100).optional(), path: relativeAssetPathSchema }).passthrough())
      .max(100)
      .default([]),
    relationships: relationshipsSchema.optional(),
    dependencies: z.array(relationshipSchema).optional(),
    manifest: z.string().max(2048).optional(),
    download: z.string().max(2048).optional(),
  })
  .passthrough();

export interface ParsedPackageManifest {
  id: string;
  title: string;
  version: string;
  description: string;
  esmodules: string[];
  scripts: string[];
  styles: string[];
  languages: { lang: string; name?: string; path: string }[];
  requiredPackageIds: string[];
  downloadUrl: string | undefined;
  minimumCoreGeneration: number | null;
  manifestData: Record<string, unknown>;
}

function coreGenerationOf(version: string | undefined): number | null {
  const generation = Number.parseInt(String(version ?? "").split(".")[0], 10);
  return Number.isFinite(generation) ? generation : null;
}

export function parsePackageManifest(rawJson: unknown): ParsedPackageManifest {
  const manifest = rawManifestSchema.parse(rawJson);
  const id = manifest.id ?? manifest.name;
  if (!id) throw new Error("Manifesto sem id");

  const requiredRelationships = manifest.relationships?.requires ?? manifest.dependencies ?? [];
  return {
    id,
    title: manifest.title,
    version: manifest.version,
    description: manifest.description,
    esmodules: manifest.esmodules,
    scripts: manifest.scripts,
    styles: manifest.styles,
    languages: manifest.languages,
    requiredPackageIds: requiredRelationships.filter((relationship) => relationship.type !== "system").map((relationship) => relationship.id),
    downloadUrl: manifest.download,
    minimumCoreGeneration: coreGenerationOf(manifest.compatibility?.minimum),
    manifestData: { ...manifest, id },
  };
}

export function manifestFileNameFor(packageType: PackageType): string {
  return packageType === "system" ? "system.json" : "module.json";
}
