import { DEFAULT_LAYER_NAMES, layerBelow, layersInGroup, type MapLayer, type MapLayerGroup } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { addLayer, deleteLayer, mergeLayerDown, moveLayer, renameLayer, updateLayer } from "./layerActions";
import { activeLayer, MAP_LAYERS_CHANGED_HOOK, sceneLayers, setActiveLayer, tilesInLayer } from "./layerStore";

const PANEL_ID = "layers-panel";
const POSITION_STORAGE_KEY = "mimicdice.layersPanel";
const RENDER_DEBOUNCE_MS = 50;
const EDGE_MARGIN_PX = 8;
const DEFAULT_POSITION = { left: 120, top: 64 };

const GROUP_TITLES: Record<MapLayerGroup, string> = { props: "Props (objetos)", map: "Mapa (chão)" };
const GROUP_HINTS: Record<MapLayerGroup, string> = {
  props: "Móveis, árvores, baús... Ficam acima do chão e abaixo dos personagens.",
  map: "O chão da cena. A imagem de fundo da cena fica embaixo de tudo.",
};

function readPosition(): { left: number; top: number } {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) ?? "null");
    if (parsed && typeof parsed === "object" && Number.isFinite((parsed as any).left) && Number.isFinite((parsed as any).top)) return { left: (parsed as any).left, top: (parsed as any).top };
  } catch {
    // A corrupt entry just resets the panel position.
  }
  return { ...DEFAULT_POSITION };
}

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
  slider.addEventListener("input", () => (output.textContent = `${slider.value}%`));
  slider.addEventListener("change", () => void updateLayer(scene, layer.id, { opacity: Number(slider.value) / 100 }));
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
    const position = readPosition();
    this.#place(position.left, position.top);
    const body = panel.querySelector(".md-layers-body");
    if (body) body.scrollTop = scrollTop;
  }

  #header(): HTMLElement {
    const close = iconButton("fa-solid fa-xmark", "Fechar camadas", () => this.setOpen(false));
    const header = h("header", { class: "md-layers-header", title: "Arraste para mover" }, h("i", { class: "fa-solid fa-layer-group", "aria-hidden": "true" }), h("strong", {}, "Camadas"), close);
    this.#enableDragging(header);
    return header;
  }

  #place(left: number, top: number): { left: number; top: number } {
    const panel = this.#element;
    if (!panel) return { left, top };
    const maxLeft = Math.max(EDGE_MARGIN_PX, window.innerWidth - panel.offsetWidth - EDGE_MARGIN_PX);
    const maxTop = Math.max(EDGE_MARGIN_PX, window.innerHeight - panel.offsetHeight - EDGE_MARGIN_PX);
    const placed = { left: Math.min(Math.max(EDGE_MARGIN_PX, left), maxLeft), top: Math.min(Math.max(EDGE_MARGIN_PX, top), maxTop) };
    panel.style.left = `${placed.left}px`;
    panel.style.top = `${placed.top}px`;
    return placed;
  }

  #enableDragging(header: HTMLElement): void {
    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
      const panel = this.#element;
      if (!panel) return;
      event.preventDefault();
      const offset = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
      let placed = { left: panel.offsetLeft, top: panel.offsetTop };
      header.setPointerCapture(event.pointerId);
      const move = (moveEvent: PointerEvent) => {
        placed = this.#place(moveEvent.clientX - offset.x, moveEvent.clientY - offset.y);
      };
      const end = () => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", end);
        header.removeEventListener("pointercancel", end);
        localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(placed));
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", end);
      header.addEventListener("pointercancel", end);
    });
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
