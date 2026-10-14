import * as PIXI from "pixi.js";

const MAX_PATH_LENGTH = 2048;
const pendingTextures = new Map<string, Promise<PIXI.Texture | null>>();

function isLoadablePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (/^\s*(javascript|data:text|vbscript):/i.test(path)) return false;
  return true;
}

/** Loads (once) and caches a texture; failures resolve to null so a broken image never breaks the scene. */
export function loadTexture(path: unknown): Promise<PIXI.Texture | null> {
  if (!isLoadablePath(path)) return Promise.resolve(null);
  const cached = pendingTextures.get(path);
  if (cached) return cached;
  const loading = PIXI.Assets.load<PIXI.Texture>(path)
    .then((texture) => (texture instanceof PIXI.Texture ? texture : null))
    .catch(() => {
      pendingTextures.delete(path);
      return null;
    });
  pendingTextures.set(path, loading);
  return loading;
}

export function getCachedTexture(path: unknown): PIXI.Texture | null {
  if (!isLoadablePath(path) || !PIXI.Assets.cache.has(path)) return null;
  return PIXI.Assets.get<PIXI.Texture>(path) ?? null;
}

export function colorToNumber(color: unknown, fallback = 0xffffff): number {
  if (typeof color === "number" && Number.isFinite(color)) return color;
  if (typeof color !== "string") return fallback;
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return match ? Number.parseInt(match[1], 16) : fallback;
}
