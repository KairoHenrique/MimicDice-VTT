import { MAX_PIPS, type SheetComponent, type SheetRollMode } from "@tabbletop/protocol";
import { isValidComputedFormula, isValidRollFormula } from "../formulaChecks";
import { checkRow, choiceRow, numberRow, textareaRow, textRow } from "./inspectorControls";
import { buildListColumnsEditor } from "./listColumnsEditor";

export type ComponentPatch = (patch: Partial<SheetComponent>) => void;

function formulaRow(component: SheetComponent, patch: ComponentPatch, kind: "roll" | "computed", hint: string): HTMLElement {
  const validate = kind === "roll" ? isValidRollFormula : isValidComputedFormula;
  return textRow("Fórmula", component.formula ?? "", "formula", (value) => {
    const formula = value.trim();
    if (formula && !validate(formula)) {
      ui.notifications.warn(kind === "roll" ? `"${formula}" não é uma rolagem válida.` : `"${formula}" não é um cálculo válido (sem dados, só números, @atalhos e funções como floor, max).`);
      return;
    }
    patch({ formula: formula || undefined });
  }, { maxlength: 300, placeholder: kind === "roll" ? "1d20 + @forca" : "floor((@forca - 10) / 2)", hint });
}

const ROLL_MODE_CHOICES: ReadonlyArray<readonly [SheetRollMode, string]> = [
  ["sum", "Somar todos os dados"],
  ["highest", "Só o maior dado"],
  ["lowest", "Só o menor dado"],
];

function rollModeRow(component: SheetComponent, patch: ComponentPatch): HTMLElement {
  return choiceRow("Resultado da rolagem", component.rollMode ?? "sum", ROLL_MODE_CHOICES, "rollMode", (mode) => patch({ rollMode: mode === "sum" ? undefined : mode }));
}

function initialNumberRow(component: SheetComponent, patch: ComponentPatch, label = "Valor inicial"): HTMLElement {
  return numberRow(label, typeof component.initial === "number" ? component.initial : undefined, "initial", (value) => patch({ initial: value }), { step: 1, hint: "Usado em fichas novas e ao aplicar o modelo." });
}

function optionsRow(component: SheetComponent, patch: ComponentPatch): HTMLElement {
  return textareaRow("Opções (uma por linha)", (component.options ?? []).join("\n"), "options", (value) => {
    const options = [...new Set(value.split(/\r?\n|,/).map((option) => option.trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
    patch({ options: options.length > 0 ? options : undefined });
  }, { maxlength: 1500 });
}

/** Settings that only make sense for one kind of component. */
export function buildKindFields(component: SheetComponent, patch: ComponentPatch): HTMLElement[] {
  switch (component.kind) {
    case "number":
      return [
        initialNumberRow(component, patch),
        numberRow("Mínimo", component.min, "min", (value) => patch({ min: value })),
        numberRow("Passo", component.step, "step", (value) => patch({ step: value && value > 0 ? value : undefined }), { min: 0, step: 0.5 }),
        formulaRow(component, patch, "roll", "Opcional: mostra um dado ao lado do número."),
        rollModeRow(component, patch),
        checkRow("Mostrar botão de rolar", component.rollable !== false, "rollable", (checked) => patch({ rollable: checked ? undefined : false })),
      ];
    case "resource":
      return [initialNumberRow(component, patch, "Valor inicial (atual e máximo)"), numberRow("Mínimo", component.min, "min", (value) => patch({ min: value }))];
    case "pips":
      return [numberRow("Quantidade de bolinhas", component.max ?? 3, "max", (value) => patch({ max: Math.min(MAX_PIPS, Math.max(1, Math.round(value ?? 3))) }), { min: 1, max: MAX_PIPS }), initialNumberRow(component, patch, "Marcadas no início")];
    case "text":
    case "longtext":
      return [textRow("Texto inicial", typeof component.initial === "string" ? component.initial : "", "initial", (value) => patch({ initial: value || undefined }), { maxlength: 2000 })];
    case "checkbox":
      return [checkRow("Começa marcada", component.initial === true, "initial", (checked) => patch({ initial: checked || undefined }))];
    case "select":
      return [optionsRow(component, patch), textRow("Opção inicial", typeof component.initial === "string" ? component.initial : "", "initial", (value) => patch({ initial: value || undefined }))];
    case "list":
      return [
        checkRow("Mostrar os itens do personagem (inventário)", component.linkItems === true, "linkItems", (checked) => patch({ linkItems: checked || undefined })),
        buildListColumnsEditor(component.columns ?? [], (columns) => patch({ columns })),
        formulaRow(component, patch, "roll", "Opcional: cada linha ganha um dado. Use @linha.<coluna>, ex.: 1d20 + @linha.bonus"),
        rollModeRow(component, patch),
      ];
    case "roll":
      return [formulaRow(component, patch, "roll", "Use @atalhos de outros componentes, ex.: 1d20 + @forca"), rollModeRow(component, patch)];
    case "computed":
      return [formulaRow(component, patch, "computed", "Sem dados. Ex.: floor((@forca - 10) / 2). Outros componentes podem usar @ deste atalho.")];
    case "title":
    case "label":
      return [textareaRow("Conteúdo", component.content ?? "", "content", (value) => patch({ content: value || undefined }), { maxlength: 4000 })];
    case "image":
      return [imagePathRow(component, patch)];
    default:
      return [];
  }
}

function imagePathRow(component: SheetComponent, patch: ComponentPatch): HTMLElement {
  const picker = document.createElement("file-picker") as HTMLElement & { value: string };
  picker.setAttribute("type", "image");
  picker.setAttribute("value", component.src ?? "");
  picker.setAttribute("placeholder", "Caminho ou URL da imagem");
  picker.addEventListener("change", () => {
    const src = String(picker.value ?? "").trim();
    patch({ src: src || undefined });
  });
  const wrapper = document.createElement("div");
  wrapper.className = "md-insp-row";
  const label = document.createElement("span");
  label.textContent = "Imagem";
  wrapper.append(label, picker);
  return wrapper;
}
