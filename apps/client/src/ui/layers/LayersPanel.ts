import { DEFAULT_LAYER_NAMES, layerBelow, layersInGroup, type MapLayer, type MapLayerGroup } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { FloatingPanelPosition } from "../common/floatingPanel";
import { addLayer, deleteLayer, mergeLayerDown, moveLayer, renameLayer, updateLayer } from "./layerActions";
import { previewLayerOpacity } from "./layerEngine";
import { activeLayer, MAP_LAYERS_CHANGED_HOOK, sceneLayers, setActiveLayer, tilesInLayer } from "./layerStore";

const PANEL_ID = "layers-panel";
const POSITION_STORAGE_KEY = "mimicdice.layersPanel";
const RENDER_DEBOUNCE_MS = 50;
const DEFAULT_POSITION = { left: 120, top: 64 };

const GROUP_TITLES: Record<MapLayerGroup, string> = { props: "Props (objetos)", map: "Mapa (chão)" };
const GROUP_HINTS: Record<MapLayerGroup, string> = {
  props: "Móveis, árvores, baús... Ficam acima do chão e abaixo dos personagens.",
  map: "O chão da cena. A imagem de fundo da cena fica embaixo de tudo.",
};

const panelPosition = new FloatingPanelPosition(POSITION_STORAGE_KEY, DEFAULT_POSITION);

function iconButton(icon: string, label: string, onClick: () => unknown, options: { pressed?: boolean; disabled?: boolean } = {}): HTMLButtonElement {
  const button = h("button", { type: "button", class: "icon md-layer-tool", title: label, "aria-label": label, disabled: options.disabled === true }, h("i", { class: icon, "aria-hidden": "true" }));
  if (options.pressed !== undefined) button.setAttribute("aria-pressed", String(options.pressed));
  button.addEventListener("click", () => void onClick());
  return button;
}

function opacitySlider(scene: any, layer: MapLayer): HTMLElement {
  const percent = Math.round(layer.opacity * 100);
  const output = h("output", { class: "md-layer-opacity-value" }, `${percent}%`);
  const slider = h("input", { type: "range", min: 0, max: 100, step: 5, value: percent, "aria-label": `Opacidade de ${layer.name}` });
  slider.addEventListener("input", () => {
    output.textContent = `${slider.value}%`;
    previewLayerOpacity(scene, layer.id, Number(slider.value) / 100);
  });
  slider.addEventListener("change", () => void updateLayer(scene, layer.id, { opacity: Number(slider.value) / 100 }).finally(() => previewLayerOpacity(scene, layer.id, null)));
  return h("label", { class: "md-layer-opacity", title: "Opacidade" }, slider, output);
}

function layerRow(scene: any, layers: readonly MapLayer[], layer: MapLayer, active: boolean, position: { first: boolean; last: boolean }): HTMLElement {
  const count = tilesInLayer(scene, layer.id).length;
  const choose = h(
    "button",
    { type: "button", class: "md-layer-name", "aria-pressed": String(active), title: active ? "Camada ativa: os novos objetos entram aqui" : "Usar esta camada para os novos objetos" },
    h("span", { translate: layer.name === DEFAULT_LAYER_NAMES[layer.group] ? "yes" : "no" }, layer.name),
    h("span", { class: "md-layer-count" }, String(count)),
  );
  choose.addEventListener("click", () => setActiveLayer(scene, layer.id));
  choose.addEventListener("dblclick", () => void renameLayer(scene, layer));
  const below = layerBelow(layers, layer.id);
  const main = h(
    "div",
    { class: "md-layer-main" },
    choose,
    iconButton(layer.visible ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", layer.visible ? `Esconder ${layer.name}` : `Mostrar ${layer.name}`, () => updateLayer(scene, layer.id, { visible: !layer.visible }), { pressed: layer.visible }),
    iconButton(layer.locked ? "fa-solid fa-lock" : "fa-solid fa-lock-open", layer.locked ? `Destravar ${layer.name}` : `Travar ${layer.name}`, () => updateLayer(scene, layer.id, { locked: !layer.locked }), { pressed: layer.locked }),
  );
  const tools = h(
    "div",
    { class: "md-layer-tools" },
    opacitySlider(scene, layer),
    iconButton("fa-solid fa-arrow-up", "Subir camada", () => moveLayer(scene, layer.id, "up"), { disabled: position.first }),
    iconButton("fa-solid fa-arrow-down", "Descer camada", () => moveLayer(scene, layer.id, "down"), { disabled: position.last }),
    iconButton("fa-solid fa-object-group", below ? `Mesclar em ${below.name}` : "Não há camada abaixo para mesclar", () => mergeLayerDown(scene, layer), { disabled: !below }),
    iconButton("fa-solid fa-pen", "Renomear", () => renameLayer(scene, layer)),
    iconButton("fa-solid fa-trash", "Apagar camada", () => deleteLayer(scene, layer), { disabled: layersInGroup(layers, layer.group).length <= 1 }),
  );
  return h("li", { class: `md-layer${active ? " active" : ""}${layer.visible ? "" : " hidden-layer"}${layer.locked ? " locked-layer" : ""}` }, main, tools);
}

function groupSection(scene: any, layers: readonly MapLayer[], group: MapLayerGroup, activeId: string): HTMLElement {
  const inGroup = layersInGroup(layers, group);
  const topFirst = [...inGroup].reverse();
  const list = h("ul", { class: "md-layer-list" }, ...topFirst.map((layer, index) => layerRow(scene, layers, layer, layer.id === activeId, { first: index === 0, last: index === topFirst.length - 1 })));
  const add = iconButton("fa-solid fa-plus", `Nova camada em ${GROUP_TITLES[group]}`, () => addLayer(scene, group));
  return h("section", { class: "md-layer-group" }, h("header", { class: "md-layer-group-header" }, h("strong", {}, GROUP_TITLES[group]), add), h("p", { class: "hint" }, GROUP_HINTS[group]), list);
}

function fixedGroup(title: string, icon: string, hint: string): HTMLElement {
  return h("section", { class: "md-layer-group fixed" }, h("header", { class: "md-layer-group-header" }, h("strong", {}, h("i", { class: icon, "aria-hidden": "true" }), " ", title)), h("p", { class: "hint" }, hint));
}

/** GM-only floating panel listing the scene layers, top of the stack first, like an image editor. */
class LayersPanel {
  #element: HTMLElement | null = null;
  #open = false;
  #queued = false;

  get open(): boolean {
    return this.#open;
  }

  setOpen(open: boolean): void {
    this.#open = open && game.user.isGM;
    this.render();
  }

  queueRender(): void {
    if (this.#queued || !this.#open) return;
    this.#queued = true;
    setTimeout(() => {
      this.#queued = false;
      this.render();
    }, RENDER_DEBOUNCE_MS);
  }

  render(): void {
    const scene = canvas?.scene;
    if (!this.#open || !scene || !game.user.isGM) {
      this.#element?.remove();
      this.#element = null;
      return;
    }
    const layers = sceneLayers(scene);
    const activeId = activeLayer(scene).id;
    const panel = h(
      "section",
      { id: PANEL_ID, class: "md-layers-panel", "aria-label": "Camadas da cena" },
      this.#header(),
      h(
        "div",
        { class: "md-layers-body" },
        fixedGroup("Notas", "fa-solid fa-bookmark", "Notas e desenhos ficam sempre por cima de tudo."),
        fixedGroup("Personagens", "fa-solid fa-user", "Tokens ficam acima dos props."),
        groupSection(scene, layers, "props", activeId),
        groupSection(scene, layers, "map", activeId),
      ),
    );
    const scrollTop = this.#element?.querySelector(".md-layers-body")?.scrollTop ?? 0;
    if (this.#element) this.#element.replaceWith(panel);
    else document.body.append(panel);
    this.#element = panel;
    panelPosition.place(panel);
    const body = panel.querySelector(".md-layers-body");
    if (body) body.scrollTop = scrollTop;
  }

  #header(): HTMLElement {
    const close = iconButton("fa-solid fa-xmark", "Fechar camadas", () => this.setOpen(false));
    const header = h("header", { class: "md-layers-header", title: "Arraste para mover" }, h("i", { class: "fa-solid fa-layer-group", "aria-hidden": "true" }), h("strong", {}, "Camadas"), close);
    panelPosition.enableDragging(header, () => this.#element);
    return header;
  }
}

let panel: LayersPanel | null = null;

export function toggleLayersPanel(): void {
  panel?.setOpen(!panel.open);
}

/** Opens by itself when the GM switches to the tiles tools, and follows scene and layer changes. */
export function installLayersPanel(): void {
  panel = new LayersPanel();
  const current = panel;
  Hooks.on(MAP_LAYERS_CHANGED_HOOK, () => current.queueRender());
  Hooks.on("canvasReady", () => current.queueRender());
  Hooks.on("activateTilesLayer", () => {
    if (!current.open) current.setOpen(true);
  });
  window.addEventListener("resize", () => current.queueRender());
}
