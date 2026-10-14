import type { MenuEntry, TileLayerState } from "@tabbletop/api";
import { MAP_LAYERS_FLAG, stackingOrder, TILE_LAYER_FLAG } from "@tabbletop/protocol";
import { moveTileToLayer, reorderTile } from "./layerActions";
import { activeLayer, asLayeredObjects, MAP_LAYERS_CHANGED_HOOK, sceneLayers, tileLayerOf, tilesInLayer } from "./layerStore";

const TILE_HOOKS = ["createTile", "updateTile", "deleteTile", "canvasReady"];

const previewedOpacity = new Map<string, number>();

function tileLayerState(document: any): TileLayerState {
  const layers = sceneLayers(document?.parent);
  const layer = tileLayerOf(document, layers);
  const opacity = previewedOpacity.get(layer.id) ?? layer.opacity;
  return { order: stackingOrder(layers, layer, Number(document?.sort) || 0), visible: layer.visible, opacity, locked: layer.locked };
}

/** Shows a layer's opacity on this screen while its slider moves; `null` goes back to the saved value. */
export function previewLayerOpacity(scene: any, layerId: string, opacity: number | null): void {
  if (opacity === null) previewedOpacity.delete(layerId);
  else previewedOpacity.set(layerId, opacity);
  if (scene?.id !== canvas?.scene?.id) return;
  for (const tile of canvas.tiles?.placeables ?? []) if (tileLayerOf(tile.document, sceneLayers(scene)).id === layerId) tile.refresh();
}

function changedLayers(change: Record<string, any>): boolean {
  const core = change?.flags?.core;
  return Boolean(core && typeof core === "object" && (MAP_LAYERS_FLAG in core || `-=${MAP_LAYERS_FLAG}` in core));
}

/** Locked or hidden tiles cannot stay selected; everything else just picks up the new order and look. */
function refreshTiles(): void {
  for (const tile of canvas?.tiles?.placeables ?? []) {
    const state = tile.layerState as TileLayerState | null;
    if (tile.controlled && (state?.locked || state?.visible === false)) tile.release();
    tile.refresh();
  }
}

/** New tiles land on top of the active layer; a locked layer refuses them. */
/** Tiles created together share one options object, so each one stacks above the previous one of the same batch. */
const nextSortByBatch = new WeakMap<object, Map<string, number>>();

function nextSortInLayer(scene: any, layerId: string, options: unknown): number {
  const batch = options && typeof options === "object" ? options : null;
  let pending = batch ? nextSortByBatch.get(batch) : undefined;
  if (batch && !pending) nextSortByBatch.set(batch, (pending = new Map()));
  const top = pending?.get(layerId) ?? asLayeredObjects(tilesInLayer(scene, layerId)).reduce((highest, object) => Math.max(highest, object.sort + 1), 0);
  pending?.set(layerId, top + 1);
  return top;
}

function placeNewTile(document: any, data: Record<string, any>, options: unknown, userId: string): boolean | void {
  if (userId !== game.user.id || data?.flags?.core?.[TILE_LAYER_FLAG]) return;
  const scene = document.parent;
  const layer = activeLayer(scene);
  if (layer.locked) {
    ui.notifications.warn(`A camada "${layer.name}" está travada. Destrave ou escolha outra no painel de camadas.`);
    return false;
  }
  document.updateSource({ sort: nextSortInLayer(scene, layer.id, options), flags: { core: { [TILE_LAYER_FLAG]: layer.id } } });
}

function tileMenuEntries(tile: any, entries: MenuEntry[]): void {
  if (!game.user.isGM) return;
  const layers = sceneLayers(tile.document.parent);
  const current = tileLayerOf(tile.document, layers);
  entries.unshift(
    { label: `Camada: ${current.name}`, icon: "fa-solid fa-layer-group", heading: true },
    { label: "Trazer para a frente", icon: "fa-solid fa-angles-up", onSelect: () => reorderTile(tile, "front") },
    { label: "Subir um", icon: "fa-solid fa-angle-up", onSelect: () => reorderTile(tile, "forward") },
    { label: "Descer um", icon: "fa-solid fa-angle-down", onSelect: () => reorderTile(tile, "backward") },
    { label: "Enviar para trás", icon: "fa-solid fa-angles-down", onSelect: () => reorderTile(tile, "back") },
  );
  const targets = layers.filter((layer) => layer.id !== current.id && !layer.locked);
  if (targets.length === 0) return;
  const moves: MenuEntry[] = targets.map((layer) => ({ label: `Mover para ${layer.name}`, icon: layer.group === "map" ? "fa-solid fa-map" : "fa-solid fa-chess-rook", onSelect: () => moveTileToLayer(tile, layer) }));
  entries.splice(5, 0, ...moves);
}

export function installLayerRules(): void {
  const tileClass = CONFIG.Tile?.objectClass;
  if (tileClass) tileClass.layerStateRule = tileLayerState;
  Hooks.on("updateScene", (scene: any, change: Record<string, any>) => {
    if (!changedLayers(change)) return;
    if (scene.id === canvas?.scene?.id) refreshTiles();
    Hooks.callAll(MAP_LAYERS_CHANGED_HOOK, scene);
  });
  for (const hook of TILE_HOOKS) Hooks.on(hook, () => Hooks.callAll(MAP_LAYERS_CHANGED_HOOK, canvas?.scene));
  Hooks.on("preCreateTile", placeNewTile);
  Hooks.on("getTileMenuEntries", tileMenuEntries);
}
