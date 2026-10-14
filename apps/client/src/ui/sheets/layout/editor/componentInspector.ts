import { SHEET_GRID_COLUMNS, MAX_COMPONENT_ROWS, type SheetComponent, type SheetComponentStyle, type SheetLayout } from "@tabbletop/protocol";
import { h } from "../../../../views/dom";
import { kindInfo, needsKey } from "../componentCatalog";
import { isValidFieldKey, layoutKeys } from "../sheetLayoutRules";
import { checkRow, colorRow, inspectorSection, numberRow, selectRow, textRow } from "./inspectorControls";
import { buildKindFields, type ComponentPatch } from "./inspectorKindFields";

export interface InspectorActions {
  patch: ComponentPatch;
  duplicate(): void;
  remove(): void;
  bringToFront(): void;
  sendToBack(): void;
  refresh(): void;
}

const SIZE_CHOICES = [["sm", "Pequeno"], ["md", "Normal"], ["lg", "Grande"], ["xl", "Muito grande"], ["xxl", "Enorme"]] as const;
const ALIGN_CHOICES = [["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]] as const;

function actionButton(icon: string, label: string, onClick: () => void, danger = false): HTMLButtonElement {
  const button = h("button", { type: "button", class: `md-icon-button${danger ? " danger" : ""}`, title: label, "aria-label": label }, h("i", { class: icon }));
  button.addEventListener("click", onClick);
  return button;
}

function keyRow(layout: SheetLayout, component: SheetComponent, actions: InspectorActions): HTMLElement {
  return textRow("Atalho @", component.key ?? "", "key", (value) => {
    const key = value.trim().toLowerCase();
    const taken = layoutKeys(layout);
    taken.delete(component.key ?? "");
    if (!isValidFieldKey(key) || taken.has(key)) {
      ui.notifications.warn(taken.has(key) ? `O atalho @${key} já existe nesta ficha.` : "Atalho inválido: comece com letra e use só a-z, 0-9 e _.");
      actions.refresh();
      return;
    }
    actions.patch({ key });
  }, { maxlength: 40, hint: "Nome usado nas fórmulas. Trocar o atalho não move o valor já salvo." });
}

function positionSection(component: SheetComponent, patch: ComponentPatch): HTMLElement {
  const place = (field: "x" | "y" | "w" | "h", offset: number) => (value: number | undefined) => {
    if (value !== undefined) patch({ [field]: Math.round(value) - offset });
  };
  return inspectorSection(
    "Posição e tamanho",
    h(
      "div",
      { class: "md-insp-grid" },
      numberRow("Coluna", component.x + 1, "pos-x", place("x", 1), { min: 1, max: SHEET_GRID_COLUMNS }),
      numberRow("Linha", component.y + 1, "pos-y", place("y", 1), { min: 1 }),
      numberRow("Largura", component.w, "pos-w", place("w", 0), { min: 1, max: SHEET_GRID_COLUMNS }),
      numberRow("Altura", component.h, "pos-h", place("h", 0), { min: 1, max: MAX_COMPONENT_ROWS }),
    ),
  );
}

function styleSection(component: SheetComponent, patch: ComponentPatch): HTMLElement {
  const style = component.style ?? {};
  const setStyle = (change: Partial<SheetComponentStyle>) => {
    const next = { ...style, ...change };
    for (const key of Object.keys(next) as Array<keyof SheetComponentStyle>) if (next[key] === undefined || next[key] === false) delete next[key];
    patch({ style: Object.keys(next).length > 0 ? next : undefined });
  };
  return inspectorSection(
    "Aparência",
    selectRow("Tamanho do texto", style.size ?? "md", SIZE_CHOICES, "style-size", (size) => setStyle({ size: size === "md" ? undefined : size })),
    selectRow("Alinhamento", style.align ?? "left", ALIGN_CHOICES, "style-align", (align) => setStyle({ align: align === "left" ? undefined : align })),
    colorRow("Cor do texto", style.text, "style-text", (text) => setStyle({ text })),
    colorRow("Fundo", style.background, "style-bg", (background) => setStyle({ background })),
    colorRow("Destaque (barra, bolinhas, linha)", style.accent, "style-accent", (accent) => setStyle({ accent })),
    h(
      "div",
      { class: "md-insp-checks" },
      checkRow("Negrito", style.bold === true, "style-bold", (bold) => setStyle({ bold })),
      checkRow("Itálico", style.italic === true, "style-italic", (italic) => setStyle({ italic })),
      checkRow("Borda", style.border === true, "style-border", (border) => setStyle({ border })),
      checkRow("Esconder nome", style.hideLabel === true, "style-hide-label", (hideLabel) => setStyle({ hideLabel })),
    ),
  );
}

/** Right-hand panel for the selected component; every change applies on `change`, so typing never re-renders. */
export function buildComponentInspector(layout: SheetLayout, component: SheetComponent | null, actions: InspectorActions): HTMLElement {
  const panel = h("aside", { class: "md-inspector", "aria-label": "Propriedades" });
  if (!component) {
    panel.append(
      h("p", { class: "md-panel-title" }, "Propriedades"),
      h("p", { class: "hint" }, "Selecione um componente para editar. Atalhos: setas movem, Shift+setas redimensionam, Delete apaga, Ctrl+D duplica, Ctrl+Z desfaz."),
    );
    return panel;
  }
  const info = kindInfo(component.kind);
  const header = h(
    "div",
    { class: "md-insp-header" },
    h("p", { class: "md-panel-title" }, h("i", { class: info.icon }), ` ${info.label}`),
    h(
      "div",
      { class: "md-insp-actions" },
      actionButton("fa-solid fa-clone", "Duplicar (Ctrl+D)", actions.duplicate),
      actionButton("fa-solid fa-angles-up", "Trazer para frente", actions.bringToFront),
      actionButton("fa-solid fa-angles-down", "Enviar para trás", actions.sendToBack),
      actionButton("fa-solid fa-trash", "Apagar (Delete)", actions.remove, true),
    ),
  );
  const identity = inspectorSection(
    "Identificação",
    textRow("Nome", component.label ?? "", "label", (value) => actions.patch({ label: value.trim() || undefined })),
    needsKey(component.kind) ? keyRow(layout, component, actions) : null,
    textRow("Dica ao passar o mouse", component.hint ?? "", "hint", (value) => actions.patch({ hint: value.trim() || undefined }), { maxlength: 160 }),
    game.user.isGM ? checkRow("Só o mestre vê", component.gmOnly === true, "gm-only", (gmOnly) => actions.patch({ gmOnly: gmOnly || undefined })) : null,
  );
  const kindFields = buildKindFields(component, actions.patch);
  panel.append(header, identity, kindFields.length > 0 ? inspectorSection("Configuração", ...kindFields) : h("span", {}), positionSection(component, actions.patch), styleSection(component, actions.patch));
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.target.blur();
    }
  });
  return panel;
}
