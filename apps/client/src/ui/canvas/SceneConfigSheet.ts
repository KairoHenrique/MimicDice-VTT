import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { GenericDocumentSheet } from "../sheets/GenericDocumentSheet";

type InputAttributes = Record<string, string | number | boolean | undefined>;

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h("div", { class: "form-group" }, h("label", {}, label), input, hint ? h("p", { class: "hint" }, hint) : null);
}

function input(name: string, value: unknown, attributes: InputAttributes, editable: boolean): HTMLInputElement {
  const element = h("input", { name, ...attributes, disabled: !editable });
  if (attributes.type === "checkbox") element.checked = value === true;
  else element.value = String(value ?? "");
  return element;
}

function imageField(name: string, value: unknown, editable: boolean): HTMLElement {
  const picker = document.createElement("file-picker");
  picker.setAttribute("name", name);
  picker.setAttribute("type", "image");
  picker.setAttribute("value", String(value ?? ""));
  picker.setAttribute("placeholder", "uploads/mapa.webp");
  if (!editable) picker.setAttribute("disabled", "");
  return picker;
}

/** Scene settings: map image, size, grid and vision. Submits on change like every DocumentSheetV2. */
export class SceneConfigSheet extends GenericDocumentSheet {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["tabbletop-sheet", "scene-config"],
    position: { width: 520 },
  };

  buildBody(editable: boolean): Node[] {
    const source = this.document._source;
    const grid = source.grid ?? {};
    const mapSection = h(
      "fieldset",
      {},
      h("legend", {}, "Mapa"),
      field("Imagem de fundo", imageField("background.src", source.background?.src, editable), "Clique no ícone para escolher ou enviar uma imagem do seu computador."),
      field("Largura (px)", input("width", source.width, { type: "number", min: 100, max: 30000, step: 1 }, editable)),
      field("Altura (px)", input("height", source.height, { type: "number", min: 100, max: 30000, step: 1 }, editable)),
      field("Margem ao redor", input("padding", source.padding, { type: "number", min: 0, max: 0.5, step: 0.05 }, editable)),
      field("Cor de fundo", input("backgroundColor", source.backgroundColor, { type: "color" }, editable)),
    );
    const gridType = h("select", { name: "grid.type", disabled: !editable }, h("option", { value: "1" }, "Quadrada"), h("option", { value: "0" }, "Sem grade"));
    gridType.value = String(grid.type ?? 1);
    gridType.dataset.dtype = "Number";
    const gridSection = h(
      "fieldset",
      {},
      h("legend", {}, "Grade"),
      field("Tipo", gridType),
      field("Tamanho do quadrado (px)", input("grid.size", grid.size, { type: "number", min: 20, max: 1000, step: 1 }, editable)),
      field("Distância por quadrado", input("grid.distance", grid.distance, { type: "number", min: 0.1, max: 1000, step: 0.1 }, editable)),
      field("Unidade", input("grid.units", grid.units, { type: "text", maxlength: 12 }, editable)),
      field("Cor das linhas", input("grid.color", grid.color, { type: "color" }, editable)),
      field("Opacidade das linhas", input("grid.alpha", grid.alpha, { type: "number", min: 0, max: 1, step: 0.05 }, editable)),
    );
    const visionSection = h(
      "fieldset",
      {},
      h("legend", {}, "Visão e névoa"),
      field("Visão por token", input("tokenVision", source.tokenVision, { type: "checkbox" }, editable), "Jogadores só enxergam o que seus tokens veem (paredes bloqueiam)."),
      field("Cena iluminada", input("environment.globalLight.enabled", source.environment?.globalLight?.enabled !== false, { type: "checkbox" }, editable), "Desmarque para cenas escuras: só luzes e o alcance de visão revelam o mapa."),
      field("Lembrar áreas exploradas", input("fog.exploration", source.fog?.exploration !== false, { type: "checkbox" }, editable)),
      field("Mostrar na barra de cenas", input("navigation", source.navigation !== false, { type: "checkbox" }, editable)),
    );
    return [mapSection, gridSection, visionSection];
  }
}
