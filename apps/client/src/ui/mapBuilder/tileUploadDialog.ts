import { DialogV2 } from "@tabbletop/api";
import { h } from "../../views/dom";
import { detectFileDpi, formatSquares, imagePixelSize, MAX_TILE_DPI, parseDpi, squaresAt, type PixelSize } from "./tileDpi";

const COMMON_SOFTWARE_DPI = new Set([72, 96]);

interface UploadRow {
  file: File;
  element: HTMLElement;
  dpiInput: HTMLInputElement;
}

function detectedHint(detected: number | null): string {
  if (detected === null) return "O arquivo não diz o DPI.";
  if (COMMON_SOFTWARE_DPI.has(detected)) return `O arquivo diz ${detected} DPI, que costuma ser o padrão do programa e não o do mapa. Confira.`;
  return `O arquivo diz ${detected} DPI.`;
}

function sizeText(size: PixelSize | null, dpi: number | null): string {
  if (!size) return "Vídeo: o tamanho sai do arquivo ao colocar.";
  const pixels = `${size.width} × ${size.height} px`;
  return dpi === null ? `${pixels}, tamanho original` : `${pixels} = ${formatSquares(squaresAt(size, dpi))}`;
}

async function uploadRow(file: File, fallbackDpi: number | undefined, objectUrls: string[]): Promise<UploadRow> {
  const isImage = file.type.startsWith("image/");
  const url = URL.createObjectURL(file);
  objectUrls.push(url);
  const [size, detected] = isImage ? await Promise.all([imagePixelSize(url), detectFileDpi(file)]) : [null, null];
  const initial = detected ?? fallbackDpi ?? null;
  const dpiInput = h("input", { type: "number", min: 1, max: MAX_TILE_DPI, step: 1, value: initial === null ? "" : String(initial), placeholder: "Original", class: "md-tile-upload-dpi", "aria-label": `DPI de ${file.name}` });
  const result = h("span", { class: "md-tile-upload-size" }, sizeText(size, initial));
  dpiInput.addEventListener("input", () => (result.textContent = sizeText(size, parseDpi(dpiInput.value))));
  const preview = isImage ? h("img", { class: "md-tile-upload-thumb", src: url, alt: "" }) : h("i", { class: "fa-solid fa-film md-tile-upload-thumb", "aria-hidden": "true" });
  const element = h(
    "li",
    { class: "md-tile-upload-row" },
    preview,
    h("div", { class: "md-tile-upload-info" }, h("strong", { class: "md-tile-upload-name", title: file.name }, file.name), result, h("span", { class: "hint" }, detectedHint(detected))),
    h("label", { class: "md-tile-upload-field" }, "DPI", dpiInput),
  );
  return { file, element, dpiInput };
}

/**
 * GM: before uploading map pieces, shows each image with the DPI read from the file (1 inch = 1 grid square, as in
 * printed battle maps) and the size it will have on the map. Returns the chosen DPI per file, or null when cancelled.
 */
export async function askTileDpi(files: readonly File[], fallbackDpi: number | undefined): Promise<Map<File, number | null> | null> {
  const objectUrls: string[] = [];
  try {
    const rows = await Promise.all(files.map((file) => uploadRow(file, fallbackDpi, objectUrls)));
    const content = h(
      "div",
      { class: "md-tile-upload" },
      h("p", { class: "hint" }, "DPI: quantos pixels da imagem formam 1 quadrado do mapa (1 polegada = 1 quadrado, como nos mapas impressos). Vazio: tamanho original."),
      h("ul", { class: "md-tile-upload-list" }, ...rows.map((row) => row.element)),
    );
    const confirmed = await DialogV2.prompt({ window: { title: files.length === 1 ? "Enviar imagem do mapa" : `Enviar ${files.length} imagens do mapa` }, position: { width: 520 } as any, content, ok: { label: "Enviar", icon: "fa-solid fa-upload", callback: () => true } });
    if (!confirmed) return null;
    return new Map(rows.map((row) => [row.file, parseDpi(row.dpiInput.value)]));
  } finally {
    for (const url of objectUrls) URL.revokeObjectURL(url);
  }
}
