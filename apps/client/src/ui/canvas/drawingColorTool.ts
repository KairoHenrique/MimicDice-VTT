import { defaultDrawingColor, drawingColorPatch, setDrawingColor } from "@tabbletop/api";
import type { SceneControlTool } from "./defaultSceneControls";

const PICKER_CLASS = "drawing-color-picker";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** Color of new drawings and texts; picking one also recolors the selected drawings the user may edit. */
export function drawingColorTool(): SceneControlTool {
  return {
    name: "color",
    order: 6,
    title: "Cor dos desenhos e textos (também muda a cor dos selecionados)",
    icon: "fa-solid fa-palette",
    iconColor: defaultDrawingColor(),
    visible: true,
    button: true,
    onChange: (event) => openDrawingColorPicker(event.currentTarget instanceof HTMLElement ? event.currentTarget : null),
  };
}

/** Must run inside the click that triggered it, or the browser refuses to open the native picker. */
function openDrawingColorPicker(anchor: HTMLElement | null): void {
  document.querySelector(`.${PICKER_CLASS}`)?.remove();
  const input = document.createElement("input");
  input.type = "color";
  input.className = PICKER_CLASS;
  input.value = selectedDrawingColor() ?? defaultDrawingColor();
  input.setAttribute("aria-label", game.i18n.localize("Cor dos desenhos e textos"));
  const bounds = anchor?.getBoundingClientRect();
  input.style.left = `${bounds?.right ?? 0}px`;
  input.style.top = `${bounds?.top ?? 0}px`;
  const icon = anchor?.querySelector<HTMLElement>("i");
  input.addEventListener("input", () => {
    if (icon) icon.style.color = input.value;
  });
  input.addEventListener("change", () => {
    input.remove();
    void applyDrawingColor(input.value);
  });
  document.body.append(input);
  input.click();
}

function editableSelectedDrawings(): any[] {
  const controlled: any[] = canvas.drawings?.controlled ?? [];
  return controlled.map((drawing) => drawing.document).filter((document) => document.isOwner && (document.locked !== true || game.user.isGM));
}

/** The color of the one selected drawing, so the picker opens on what the user clicked. */
function selectedDrawingColor(): string | null {
  const drawings = editableSelectedDrawings();
  if (drawings.length !== 1) return null;
  const source = drawings[0]._source;
  const color = "textColor" in drawingColorPatch(source, "") ? source.textColor : source.strokeColor;
  return typeof color === "string" && COLOR_PATTERN.test(color) ? color : null;
}

async function applyDrawingColor(color: string): Promise<void> {
  if (!setDrawingColor(color)) return;
  const drawings = editableSelectedDrawings();
  if (drawings.length > 0) await canvas.scene.updateEmbeddedDocuments("Drawing", drawings.map((document) => ({ _id: document.id, ...drawingColorPatch(document._source, color) })));
  await ui.controls.render();
}
