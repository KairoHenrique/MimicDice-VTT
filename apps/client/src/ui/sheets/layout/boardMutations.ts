import { MAX_COMPONENT_ROWS, MAX_COMPONENTS_PER_PAGE, MAX_SHEET_PAGES, MAX_SHEET_ROWS, SHEET_GRID_COLUMNS, type SheetComponent, type SheetComponentKind, type SheetLayout, type SheetPage } from "@tabbletop/protocol";
import { kindInfo, needsKey } from "./componentCatalog";
import { clampNumber, keyFromLabel, layoutKeys, newLocalId } from "./sheetLayoutRules";
import { DEFAULT_SKILL_LABELS, skillsFromLabels } from "./skillList";

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Keeps a rectangle inside the 12-column grid and the row limits. */
export function clampRect(rect: GridRect): GridRect {
  const w = clampNumber(Math.round(rect.w), 1, SHEET_GRID_COLUMNS);
  const h = clampNumber(Math.round(rect.h), 1, MAX_COMPONENT_ROWS);
  return { w, h, x: clampNumber(Math.round(rect.x), 0, SHEET_GRID_COLUMNS - w), y: clampNumber(Math.round(rect.y), 0, MAX_SHEET_ROWS - h) };
}

function overlaps(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** First top-left position where a `w`x`h` block fits without covering another component. */
export function findFreeSpot(components: readonly GridRect[], w: number, h: number): GridRect {
  for (let y = 0; y < MAX_SHEET_ROWS - h; y++) {
    for (let x = 0; x + w <= SHEET_GRID_COLUMNS; x++) {
      const candidate = { x, y, w, h };
      if (!components.some((component) => overlaps(candidate, component))) return candidate;
    }
  }
  return clampRect({ x: 0, y: MAX_SHEET_ROWS - h, w, h });
}

export function bottomRow(components: readonly GridRect[]): number {
  return components.reduce((bottom, component) => Math.max(bottom, component.y + component.h), 0);
}

function mapPage(layout: SheetLayout, pageId: string, change: (page: SheetPage) => SheetPage): SheetLayout {
  return { ...layout, pages: layout.pages.map((page) => (page.id === pageId ? change(page) : page)) };
}

function mapComponents(layout: SheetLayout, pageId: string, change: (components: SheetComponent[]) => SheetComponent[]): SheetLayout {
  return mapPage(layout, pageId, (page) => ({ ...page, components: change(page.components) }));
}

/** New component of `kind`; dropped at `at` when given, otherwise in the first free gap of the page. */
export function createComponent(layout: SheetLayout, page: SheetPage, kind: SheetComponentKind, at?: { x: number; y: number }): SheetComponent {
  const info = kindInfo(kind);
  const { w, h } = info.defaultSize;
  const rect = at ? clampRect({ ...at, w, h }) : findFreeSpot(page.components, w, h);
  const component: SheetComponent = { id: newLocalId(), kind, ...rect, label: info.label };
  if (needsKey(kind)) component.key = keyFromLabel(info.label, layoutKeys(layout));
  if (kind === "title") component.content = "Novo título";
  if (kind === "label") component.content = "Escreva aqui um lembrete ou regra.";
  if (kind === "select") component.options = ["Opção 1", "Opção 2"];
  if (kind === "pips") component.max = 5;
  if (kind === "roll") component.formula = "1d20";
  if (kind === "computed") component.formula = "1 + 1";
  if (kind === "list") component.columns = [{ key: "nome", label: "Nome", type: "text" }, { key: "qtd", label: "Qtd", type: "number" }];
  if (kind === "skills") component.skills = skillsFromLabels(DEFAULT_SKILL_LABELS);
  return component;
}

export function addComponent(layout: SheetLayout, pageId: string, component: SheetComponent): SheetLayout {
  const page = layout.pages.find((entry) => entry.id === pageId);
  if (page && page.components.length >= MAX_COMPONENTS_PER_PAGE) throw new Error(`Limite de ${MAX_COMPONENTS_PER_PAGE} componentes por página.`);
  return mapComponents(layout, pageId, (components) => [...components, component]);
}

export function updateComponent(layout: SheetLayout, pageId: string, componentId: string, patch: Partial<SheetComponent>): SheetLayout {
  return mapComponents(layout, pageId, (components) => components.map((component) => (component.id === componentId ? { ...component, ...patch } : component)));
}

export function placeComponent(layout: SheetLayout, pageId: string, componentId: string, rect: GridRect): SheetLayout {
  return updateComponent(layout, pageId, componentId, clampRect(rect));
}

export function removeComponent(layout: SheetLayout, pageId: string, componentId: string): SheetLayout {
  return mapComponents(layout, pageId, (components) => components.filter((component) => component.id !== componentId));
}

export function removeComponents(layout: SheetLayout, pageId: string, componentIds: ReadonlySet<string>): SheetLayout {
  return mapComponents(layout, pageId, (components) => components.filter((component) => !componentIds.has(component.id)));
}

/** The largest step toward (dx, dy) that keeps every rect of the group inside the grid, so the group keeps its shape. */
export function clampGroupDelta(rects: readonly GridRect[], dx: number, dy: number): { dx: number; dy: number } {
  if (rects.length === 0) return { dx: 0, dy: 0 };
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.w));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.h));
  return { dx: clampNumber(Math.round(dx), 0 - left, SHEET_GRID_COLUMNS - right) + 0, dy: clampNumber(Math.round(dy), 0 - top, MAX_SHEET_ROWS - bottom) + 0 };
}

export function moveComponents(layout: SheetLayout, pageId: string, componentIds: ReadonlySet<string>, dx: number, dy: number): SheetLayout {
  return mapComponents(layout, pageId, (components) => {
    const delta = clampGroupDelta(components.filter((component) => componentIds.has(component.id)), dx, dy);
    if (delta.dx === 0 && delta.dy === 0) return components;
    return components.map((component) => (componentIds.has(component.id) ? { ...component, x: component.x + delta.dx, y: component.y + delta.dy } : component));
  });
}

/** Ids of the components a selection box touches. */
export function componentsInArea(components: readonly SheetComponent[], area: GridRect): string[] {
  return components.filter((component) => overlaps(component, area)).map((component) => component.id);
}

/** Copy placed right below the original with a fresh id and key, so both keep separate values. */
export function duplicateComponent(layout: SheetLayout, pageId: string, componentId: string): { layout: SheetLayout; copyId: string | null } {
  const page = layout.pages.find((entry) => entry.id === pageId);
  const original = page?.components.find((component) => component.id === componentId);
  if (!page || !original) return { layout, copyId: null };
  const copy: SheetComponent = { ...structuredClone(original), id: newLocalId(), ...clampRect({ ...original, y: original.y + original.h }) };
  if (original.key) copy.key = keyFromLabel(original.key, layoutKeys(layout));
  return { layout: addComponent(layout, pageId, copy), copyId: copy.id };
}

/** Moves a component one step in paint order; later components are drawn above earlier ones. */
export function reorderComponent(layout: SheetLayout, pageId: string, componentId: string, toFront: boolean): SheetLayout {
  return mapComponents(layout, pageId, (components) => {
    const target = components.find((component) => component.id === componentId);
    if (!target) return components;
    const rest = components.filter((component) => component.id !== componentId);
    return toFront ? [...rest, target] : [target, ...rest];
  });
}

export function addPage(layout: SheetLayout, title: string): { layout: SheetLayout; pageId: string } {
  if (layout.pages.length >= MAX_SHEET_PAGES) throw new Error(`Limite de ${MAX_SHEET_PAGES} páginas.`);
  const page: SheetPage = { id: newLocalId(), title: title.slice(0, 60) || "Página", components: [] };
  return { layout: { ...layout, pages: [...layout.pages, page] }, pageId: page.id };
}

export function renamePage(layout: SheetLayout, pageId: string, title: string): SheetLayout {
  const trimmed = title.trim().slice(0, 60);
  return trimmed ? mapPage(layout, pageId, (page) => ({ ...page, title: trimmed })) : layout;
}

export function removePage(layout: SheetLayout, pageId: string): SheetLayout {
  if (layout.pages.length <= 1) throw new Error("A ficha precisa de pelo menos uma página.");
  return { ...layout, pages: layout.pages.filter((page) => page.id !== pageId) };
}

export function movePage(layout: SheetLayout, pageId: string, direction: -1 | 1): SheetLayout {
  const index = layout.pages.findIndex((page) => page.id === pageId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.pages.length) return layout;
  const pages = [...layout.pages];
  [pages[index], pages[target]] = [pages[target], pages[index]];
  return { ...layout, pages };
}
