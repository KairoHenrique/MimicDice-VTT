import type { SheetLayout, SheetPage } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import type { BoardContext } from "./boardContext";
import { bottomRow } from "./boardMutations";
import { buildPlacedComponent } from "./componentView";

export interface PageSelection {
  readonly activePageId: string | null;
  readonly onSelectPage: (pageId: string) => void;
}

export function resolveActivePage(layout: SheetLayout, pageId: string | null): SheetPage {
  return layout.pages.find((page) => page.id === pageId) ?? layout.pages[0];
}

export function buildPageTabs(layout: SheetLayout, active: SheetPage, onSelect: (pageId: string) => void): HTMLElement {
  const nav = h("nav", { class: "md-page-tabs", role: "tablist", "aria-label": "Páginas da ficha" });
  for (const page of layout.pages) {
    const selected = page.id === active.id;
    const tab = h("button", { type: "button", role: "tab", class: `md-page-tab${selected ? " active" : ""}`, "aria-selected": String(selected) }, page.title);
    tab.addEventListener("click", () => onSelect(page.id));
    nav.append(tab);
  }
  return nav;
}

/** Read/fill view of the sheet: one page of the 12-column grid at a time. */
export function buildBoardView(context: BoardContext, layout: SheetLayout, selection: PageSelection): HTMLElement {
  const page = resolveActivePage(layout, selection.activePageId);
  const visible = page.components.filter((component) => context.isVisible(component));
  const grid = h("div", { class: "md-board", style: `--md-rows:${Math.max(1, bottomRow(visible))}` }, ...visible.map((component) => buildPlacedComponent(context, component)));
  const container = h("div", { class: "md-board-view" });
  if (layout.pages.length > 1) container.append(buildPageTabs(layout, page, selection.onSelectPage));
  if (visible.length === 0) {
    container.append(h("p", { class: "hint md-empty" }, context.editable ? "Página vazia. Use \"Modelos\" para aplicar uma ficha pronta ou \"Editar ficha\" para montar a sua arrastando componentes." : "Página vazia."));
  } else {
    container.append(grid);
  }
  return container;
}
