import { placeImageTile } from "@tabbletop/api";
import { ImageLibraryPanel } from "./ImageLibraryPanel";

interface DropPoint {
  x: number;
  y: number;
  free: boolean;
}

let panel: ImageLibraryPanel | null = null;

export function toggleImageLibrary(): void {
  if (panel) void panel.setOpen(!panel.open);
}

/** Files dragged from the computer onto the map are uploaded to the library folder and placed side by side. */
async function placeDroppedFiles(library: ImageLibraryPanel, files: File[], point: DropPoint): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn("Só o mestre monta o mapa.");
    return;
  }
  const stored = await library.upload(files);
  const step = (Number(canvas.grid?.size) || 100) / 2;
  for (const [index, path] of stored.entries()) {
    await placeImageTile(canvas, path, { x: point.x + index * step, y: point.y + index * step }, { ...library.placement(), free: point.free });
  }
}

/** The image library opens with the tiles tools (unless the GM closed it) and accepts files dropped on the map. */
export function installImageLibrary(): void {
  const library = new ImageLibraryPanel();
  panel = library;
  Hooks.on("activateTilesLayer", () => {
    if (game.user.isGM && !library.open && library.wasOpen()) void library.setOpen(true);
  });
  Hooks.on("dropCanvasFiles", (_canvas: unknown, files: File[], point: DropPoint) => void placeDroppedFiles(library, files, point));
  window.addEventListener("resize", () => {
    if (library.open) library.render();
  });
}
