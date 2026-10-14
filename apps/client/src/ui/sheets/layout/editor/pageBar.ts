import type { SheetLayout, SheetPage } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";

export interface PageBarActions {
  select(pageId: string): void;
  add(): void;
  rename(title: string): void;
  move(direction: -1 | 1): void;
  remove(): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

function iconButton(icon: string, label: string, onClick: () => void, options: { disabled?: boolean; danger?: boolean } = {}): HTMLButtonElement {
  const button = h("button", { type: "button", class: `md-icon-button${options.danger ? " danger" : ""}`, title: label, "aria-label": label, disabled: options.disabled === true }, h("i", { class: icon }));
  button.addEventListener("click", onClick);
  return button;
}

/** Page tabs plus page-level tools (rename, reorder, remove) and undo/redo for the whole layout. */
export function buildPageBar(layout: SheetLayout, active: SheetPage, actions: PageBarActions): HTMLElement {
  const tabs = h("div", { class: "md-page-tabs", role: "tablist", "aria-label": "Páginas da ficha" });
  for (const page of layout.pages) {
    const selected = page.id === active.id;
    const tab = h("button", { type: "button", role: "tab", class: `md-page-tab${selected ? " active" : ""}`, "aria-selected": String(selected) }, page.title);
    tab.addEventListener("click", () => actions.select(page.id));
    tabs.append(tab);
  }
  tabs.append(iconButton("fa-solid fa-plus", "Nova página", actions.add));

  const index = layout.pages.findIndex((page) => page.id === active.id);
  const title = h("input", { type: "text", value: active.title, maxlength: 60, "aria-label": "Nome da página", class: "md-page-title-input" });
  title.dataset.focusKey = "page-title";
  title.addEventListener("change", () => actions.rename(title.value));
  title.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      title.blur();
    }
  });
  const tools = h(
    "div",
    { class: "md-page-tools" },
    iconButton("fa-solid fa-rotate-left", "Desfazer (Ctrl+Z)", actions.undo, { disabled: !actions.canUndo }),
    iconButton("fa-solid fa-rotate-right", "Refazer (Ctrl+Y)", actions.redo, { disabled: !actions.canRedo }),
    h("span", { class: "md-toolbar-separator" }),
    title,
    iconButton("fa-solid fa-chevron-left", "Mover página para a esquerda", () => actions.move(-1), { disabled: index <= 0 }),
    iconButton("fa-solid fa-chevron-right", "Mover página para a direita", () => actions.move(1), { disabled: index >= layout.pages.length - 1 }),
    iconButton("fa-solid fa-trash", "Apagar página", actions.remove, { disabled: layout.pages.length <= 1, danger: true }),
  );
  return h("div", { class: "md-page-bar" }, tabs, tools);
}
