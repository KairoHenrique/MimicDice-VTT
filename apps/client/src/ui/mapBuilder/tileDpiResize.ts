import { dataPathToUrl, DialogV2 } from "@tabbletop/api";
import { h } from "../../views/dom";
import { detectPathDpi, formatSquares, imagePixelSize, MAX_TILE_DPI, parseDpi, rememberDpi, rememberedDpi, squaresAt } from "./tileDpi";

interface MenuEntry {
  label: string;
  icon: string;
  onSelect: () => unknown;
}

/** GM: resizes a tile so its image keeps the chosen DPI (pixels of the image per grid square); the top-left corner stays. */
async function resizeTileByDpi(tileDocument: any): Promise<void> {
  const path = String(tileDocument.texture?.src ?? "");
  const size = path ? await imagePixelSize(dataPathToUrl(path)) : null;
  if (!size) {
    ui.notifications.warn("Não foi possível ler o tamanho desta imagem (vídeos não têm DPI).");
    return;
  }
  const detected = await detectPathDpi(path);
  const remembered = rememberedDpi(path);
  const initial = remembered === undefined ? detected : remembered;
  const input = h("input", { type: "number", min: 1, max: MAX_TILE_DPI, step: 1, value: initial ? String(initial) : "", placeholder: "Original", class: "md-tile-upload-dpi", "aria-label": "DPI da imagem" });
  const result = h("p", { class: "md-tile-upload-size" });
  const describe = () => {
    const dpi = parseDpi(input.value);
    result.textContent = `${size.width} × ${size.height} px = ${dpi === null ? "tamanho original" : formatSquares(squaresAt(size, dpi))}`;
  };
  input.addEventListener("input", describe);
  describe();
  const content = h(
    "div",
    { class: "md-tile-upload" },
    h("p", { class: "hint" }, `DPI: quantos pixels da imagem formam 1 quadrado do mapa (1 polegada = 1 quadrado). ${detected ? `O arquivo diz ${detected} DPI.` : "O arquivo não diz o DPI."}`),
    h("label", { class: "md-tile-upload-field" }, "DPI", input),
    result,
  );
  const confirmed = await DialogV2.prompt({ window: { title: "Tamanho pelo DPI" }, position: { width: 420 } as any, content, ok: { label: "Aplicar", icon: "fa-solid fa-ruler-combined", callback: () => true } });
  if (!confirmed) return;
  const dpi = parseDpi(input.value);
  const gridSize = Number(canvas.grid?.size) || 100;
  const squares = dpi === null ? { width: size.width / gridSize, height: size.height / gridSize } : squaresAt(size, dpi);
  rememberDpi(path, dpi);
  await tileDocument.update({ width: Math.max(1, Math.round(squares.width * gridSize)), height: Math.max(1, Math.round(squares.height * gridSize)) });
}

export function installTileDpiResize(): void {
  Hooks.on("getTileMenuEntries", (tile: any, entries: MenuEntry[]) => {
    if (game.user.isGM && tile?.document?.texture?.src) entries.push({ label: "Tamanho pelo DPI", icon: "fa-solid fa-ruler-combined", onSelect: () => resizeTileByDpi(tile.document) });
  });
}
