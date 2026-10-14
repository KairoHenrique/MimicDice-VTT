import type { SheetComponentKind } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import { COMPONENT_CATALOG, PALETTE_GROUP_LABELS, type PaletteGroup } from "../componentCatalog";
import { PALETTE_DRAG_TYPE } from "./boardCanvas";

const GROUP_ORDER: readonly PaletteGroup[] = ["values", "actions", "decoration"];

/** Component cards: drag one onto the grid, or click to drop it in the first free gap. */
export function buildPalette(onAdd: (kind: SheetComponentKind) => void): HTMLElement {
  const palette = h("aside", { class: "md-palette", "aria-label": "Componentes" }, h("p", { class: "md-panel-title" }, "Componentes"), h("p", { class: "hint" }, "Arraste para a ficha ou clique para adicionar."));
  for (const group of GROUP_ORDER) {
    const list = h("div", { class: "md-palette-group", role: "group", "aria-label": PALETTE_GROUP_LABELS[group] }, h("span", { class: "md-palette-heading" }, PALETTE_GROUP_LABELS[group]));
    for (const info of COMPONENT_CATALOG.filter((entry) => entry.group === group)) {
      const item = h("button", { type: "button", class: "md-palette-item", draggable: "true", title: info.description }, h("i", { class: info.icon }), h("span", {}, info.label));
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData(PALETTE_DRAG_TYPE, info.kind);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      });
      item.addEventListener("click", () => onAdd(info.kind));
      list.append(item);
    }
    palette.append(list);
  }
  return palette;
}
