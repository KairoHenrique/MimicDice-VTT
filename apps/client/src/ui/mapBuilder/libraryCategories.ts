/** Top-level library folders, like Owlbear's Maps / Characters / Props. */
export interface LibraryCategory {
  id: "mapas" | "personagens" | "props";
  path: string;
  label: string;
}

export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
  { id: "mapas", path: "uploads/mapas", label: "Mapas" },
  { id: "personagens", path: "uploads/personagens", label: "Personagens" },
  { id: "props", path: "uploads/props", label: "Props" },
] as const;

export const LIBRARY_ROOT = "uploads";
export const DEFAULT_LIBRARY_FOLDER = LIBRARY_CATEGORIES[0].path;

/** Which category a folder belongs to, or null when it is outside the three (e.g. Outros). */
export function categoryOf(folder: string): LibraryCategory | null {
  const normalized = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  return LIBRARY_CATEGORIES.find((category) => normalized === category.path || normalized.startsWith(`${category.path}/`)) ?? null;
}

export function categoryLabel(folder: string): string {
  return categoryOf(folder)?.label ?? "Outros";
}
