import type { PlainObject } from "@tabbletop/common";
import { normalizeDataPath } from "../../applications/apps/FilePicker";
import { currentGame, currentUi } from "../../runtime";
import { loadTexture } from "../textures";

/** Drag data type for an image that becomes a map tile when dropped on the board. */
export const IMAGE_TILE_DROP_TYPE = "Tile";
const MAX_IMAGE_PATH_LENGTH = 2048;
const PLAYABLE_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|avif|svg|webm|mp4|m4v)$/i;

export interface ImageTilePlacement {
  /** Pixels of the image that make one square of the scene grid; empty or 0 keeps the image's own pixel size. */
  pixelsPerSquare?: number;
  /** Shift on drop: no snapping, exact size. */
  free?: boolean;
}

interface Size {
  width: number;
  height: number;
}

export function imageTileDragData(path: string, placement: ImageTilePlacement = {}): PlainObject {
  return { type: IMAGE_TILE_DROP_TYPE, texture: { src: path }, ...placement };
}

function safeImagePath(value: unknown): string | null {
  const path = normalizeDataPath(value);
  if (!path || path.length > MAX_IMAGE_PATH_LENGTH || path.includes("..") || !PLAYABLE_IMAGE_PATTERN.test(path)) return null;
  return path;
}

function roundToStep(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/** Natural image size converted to scene pixels, kept inside the scene and never below a quarter square. */
async function tileSizeFor(canvas: any, path: string, placement: ImageTilePlacement): Promise<Size> {
  const grid = Number(canvas.grid.size) || 100;
  const quarter = grid / 4;
  const texture = await loadTexture(path);
  const pixelsPerSquare = Number(placement.pixelsPerSquare) > 0 ? Number(placement.pixelsPerSquare) : grid;
  const scale = grid / pixelsPerSquare;
  let width = (Number(texture?.width) || grid) * scale;
  let height = (Number(texture?.height) || grid) * scale;
  const fit = Math.min(1, Number(canvas.dimensions?.sceneWidth) / width || 1, Number(canvas.dimensions?.sceneHeight) / height || 1);
  width *= fit;
  height *= fit;
  if (placement.free) return { width: Math.max(quarter, Math.round(width)), height: Math.max(quarter, Math.round(height)) };
  return { width: roundToStep(width, quarter), height: roundToStep(height, quarter) };
}

/** The GM drops an image on the map: it becomes a tile centered on the point, snapped by quarter squares. */
export async function placeImageTile(canvas: any, imagePath: unknown, point: { x: number; y: number }, placement: ImageTilePlacement = {}): Promise<any | null> {
  if (!currentGame()?.user?.isGM) {
    currentUi()?.notifications?.warn("Só o mestre monta o mapa.");
    return null;
  }
  const path = safeImagePath(imagePath);
  if (!path || !canvas?.scene) return null;
  const size = await tileSizeFor(canvas, path, placement);
  const topLeft = { x: point.x - size.width / 2, y: point.y - size.height / 2 };
  const corner = placement.free ? { x: Math.round(topLeft.x), y: Math.round(topLeft.y) } : canvas.grid.getSnappedPoint(topLeft, { mode: "quarter" });
  const [document] = await canvas.scene.createEmbeddedDocuments("Tile", [{ x: corner.x, y: corner.y, ...size, texture: { src: path } }]);
  canvas.tiles?.activate?.();
  document?.object?.control?.({ releaseOthers: true });
  return document ?? null;
}
