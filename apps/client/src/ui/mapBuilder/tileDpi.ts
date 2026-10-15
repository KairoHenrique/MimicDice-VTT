import { dataPathToUrl } from "@tabbletop/api";
import { IMAGE_DPI_HEADER_BYTES, readImageDpi } from "@tabbletop/common";

const DPI_BY_PATH_KEY = "mimicdice.imageLibrary.dpiByPath";
const MAX_REMEMBERED_PATHS = 500;
const ORIGINAL_SIZE = 0;
export const MAX_TILE_DPI = 4096;

export interface PixelSize {
  width: number;
  height: number;
}

/** A typed DPI (pixels of the image per grid square); null when empty or invalid. */
export function parseDpi(value: string): number | null {
  if (value.trim() === "") return null;
  const dpi = Math.round(Number(value));
  return Number.isFinite(dpi) && dpi > 0 ? Math.min(dpi, MAX_TILE_DPI) : null;
}

export async function detectFileDpi(file: Blob): Promise<number | null> {
  try {
    return readImageDpi(new Uint8Array(await file.slice(0, IMAGE_DPI_HEADER_BYTES).arrayBuffer()));
  } catch {
    return null;
  }
}

/** Reads the DPI stored in an image already uploaded to the server. */
export async function detectPathDpi(path: string): Promise<number | null> {
  try {
    const response = await fetch(dataPathToUrl(path), { headers: { Range: `bytes=0-${IMAGE_DPI_HEADER_BYTES - 1}` }, credentials: "same-origin" });
    if (!response.ok) return null;
    return await detectFileDpi(await response.blob());
  } catch {
    return null;
  }
}

/** Natural pixel size of an image URL (object URL or server path); null for videos or broken files. */
export function imagePixelSize(url: string): Promise<PixelSize | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Size in grid squares of an image at this DPI, rounded to quarter squares like the tiles. */
export function squaresAt(size: PixelSize, dpi: number): PixelSize {
  const quarter = (value: number) => Math.max(0.25, Math.round((value / dpi) * 4) / 4);
  return { width: quarter(size.width), height: quarter(size.height) };
}

/** Compact grid size for badges, e.g. `2×1`. */
export function formatGridSize(squares: PixelSize): string {
  const format = (value: number) => String(value).replace(".", ",");
  return `${format(squares.width)}×${format(squares.height)}`;
}

export function formatSquares(squares: PixelSize): string {
  return `${formatGridSize(squares)} quadrados`;
}

/** Forgets the DPI remembered for paths that were deleted from the library. */
export function forgetDpi(paths: readonly string[]): void {
  const map = rememberedMap();
  let changed = false;
  for (const path of paths) {
    if (!(path in map)) continue;
    delete map[path];
    changed = true;
  }
  if (changed) localStorage.setItem(DPI_BY_PATH_KEY, JSON.stringify(map));
}

function rememberedMap(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DPI_BY_PATH_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** DPI the GM chose for this image when uploading or resizing it; null when they chose its original size. */
export function rememberedDpi(path: string): number | null | undefined {
  const stored = rememberedMap()[path];
  if (stored === ORIGINAL_SIZE) return null;
  const dpi = Number(stored);
  return Number.isFinite(dpi) && dpi > 0 && dpi <= MAX_TILE_DPI ? dpi : undefined;
}

export function rememberDpi(path: string, dpi: number | null): void {
  const map = rememberedMap();
  delete map[path];
  map[path] = dpi ?? ORIGINAL_SIZE;
  const entries = Object.entries(map).slice(-MAX_REMEMBERED_PATHS);
  localStorage.setItem(DPI_BY_PATH_KEY, JSON.stringify(Object.fromEntries(entries)));
}
