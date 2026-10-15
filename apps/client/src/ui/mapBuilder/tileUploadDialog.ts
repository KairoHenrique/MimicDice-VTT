import { DialogV2 } from "@tabbletop/api";
import { h } from "../../views/dom";
import { LIBRARY_CATEGORIES, type LibraryCategory } from "./libraryCategories";
import { detectFileDpi, formatGridSize, formatSquares, imagePixelSize, MAX_TILE_DPI, parseDpi, squaresAt, type PixelSize } from "./tileDpi";

const COMMON_SOFTWARE_DPI = new Set([72, 96]);

export interface TileUploadOptions {
  fallbackDpi?: number;
  /** Pre-selected category; when set the selector is hidden. */
  category?: LibraryCategory;
  /** When true, show the category selector (upload from an ambiguous place). */
  askCategory?: boolean;
  title?: string;
}

export interface TileUploadResult {
  dpiByFile: Map<File, number | null>;
  category: LibraryCategory;
}

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

function gridBadge(size: PixelSize | null, dpi: number | null): string {
  if (!size) return "Vídeo";
  if (dpi === null) return "Original";
  return formatGridSize(squaresAt(size, dpi));
}

function sizeDetail(size: PixelSize | null, dpi: number | null): string {
  if (!size) return "O tamanho sai do arquivo ao colocar.";
  const pixels = `${size.width} × ${size.height} px`;
  return dpi === null ? `${pixels}, tamanho original` : `${pixels} · ${formatSquares(squaresAt(size, dpi))}`;
}

async function uploadRow(file: File, fallbackDpi: number | undefined, objectUrls: string[]): Promise<UploadRow> {
  const isImage = file.type.startsWith("image/");
  const url = URL.createObjectURL(file);
  objectUrls.push(url);
  const [size, detected] = isImage ? await Promise.all([imagePixelSize(url), detectFileDpi(file)]) : [null, null];
  const initial = detected ?? fallbackDpi ?? null;
  const dpiInput = h("input", { type: "number", min: 1, max: MAX_TILE_DPI, step: 1, value: initial === null ? "" : String(initial), placeholder: "Original", class: "md-tile-upload-dpi", "aria-label": `DPI de ${file.name}` });
  const badge = h("strong", { class: "md-tile-upload-grid", "aria-label": "Tamanho na grade" }, gridBadge(size, initial));
  const detail = h("span", { class: "md-tile-upload-size" }, sizeDetail(size, initial));
  const sync = () => {
    const dpi = parseDpi(dpiInput.value);
    badge.textContent = gridBadge(size, dpi);
    detail.textContent = sizeDetail(size, dpi);
  };
  dpiInput.addEventListener("input", sync);
  const preview = isImage ? h("img", { class: "md-tile-upload-thumb", src: url, alt: "" }) : h("i", { class: "fa-solid fa-film md-tile-upload-thumb", "aria-hidden": "true" });
  const element = h(
    "li",
    { class: "md-tile-upload-row" },
    preview,
    h("div", { class: "md-tile-upload-info" }, h("strong", { class: "md-tile-upload-name", title: file.name }, file.name), badge, detail, h("span", { class: "hint" }, detectedHint(detected))),
    h("label", { class: "md-tile-upload-field" }, "DPI", dpiInput),
  );
  return { file, element, dpiInput };
}

function categorySelect(initial: LibraryCategory): HTMLSelectElement {
  return h(
    "select",
    { name: "libraryCategory", class: "md-tile-upload-category", "aria-label": "Pasta de destino" },
    ...LIBRARY_CATEGORIES.map((category) => h("option", { value: category.id, selected: category.id === initial.id }, category.label)),
  );
}

/**
 * GM: before uploading, shows each image with grid size in focus (1×1, 2×1) and DPI as the control. Optionally asks
 * which library folder (Mapas / Personagens / Props) receives the files.
 */
export async function askTileDpi(files: readonly File[], options: TileUploadOptions = {}): Promise<TileUploadResult | null> {
  const objectUrls: string[] = [];
  try {
    const initialCategory = options.category ?? LIBRARY_CATEGORIES[0];
    const rows = await Promise.all(files.map((file) => uploadRow(file, options.fallbackDpi, objectUrls)));
    const select = options.askCategory ? categorySelect(initialCategory) : null;
    const content = h(
      "div",
      { class: "md-tile-upload" },
      select ? h("label", { class: "md-tile-upload-category-field" }, "Pasta", select) : null,
      h("p", { class: "hint" }, "O tamanho grande (ex.: 2×1) é quantos quadrados a imagem ocupará. DPI: pixels por quadrado (1 polegada = 1 quadrado). Vazio: tamanho original."),
      h("ul", { class: "md-tile-upload-list" }, ...rows.map((row) => row.element)),
    );
    const defaultTitle = files.length === 1 ? `Enviar imagem · ${initialCategory.label}` : `Enviar ${files.length} imagens · ${initialCategory.label}`;
    const confirmed = await DialogV2.prompt({
      window: { title: options.title ?? defaultTitle },
      position: { width: 520 } as any,
      content,
      ok: { label: "Enviar", icon: "fa-solid fa-upload", callback: () => true },
    });
    if (!confirmed) return null;
    const chosen = select ? (LIBRARY_CATEGORIES.find((category) => category.id === select.value) ?? initialCategory) : initialCategory;
    return { dpiByFile: new Map(rows.map((row) => [row.file, parseDpi(row.dpiInput.value)])), category: chosen };
  } finally {
    for (const url of objectUrls) URL.revokeObjectURL(url);
  }
}
