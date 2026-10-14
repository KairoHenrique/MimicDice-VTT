import { type LayeredObject, layersInGroup, MAP_LAYERS_FLAG, type MapLayer, parseMapLayers, resolveTileLayer, TILE_LAYER_FLAG } from "@tabbletop/protocol";

export const MAP_LAYERS_CHANGED_HOOK = "mapLayersChanged";

const DEFAULT_LAYERS: readonly MapLayer[] = Object.freeze(parseMapLayers(undefined));
/** Parsing runs for every tile refresh, so results are kept per stored array (a new array arrives on each change). */
const parsedByStoredArray = new WeakMap<object, MapLayer[]>();
const activeLayerByScene = new Map<string, string>();

export function sceneLayers(scene: any = canvas?.scene): MapLayer[] {
  const stored = scene?.flags?.core?.[MAP_LAYERS_FLAG];
  if (!Array.isArray(stored)) return [...DEFAULT_LAYERS];
  let parsed = parsedByStoredArray.get(stored);
  if (!parsed) {
    parsed = parseMapLayers(stored);
    parsedByStoredArray.set(stored, parsed);
  }
  return parsed;
}

export async function saveSceneLayers(scene: any, layers: readonly MapLayer[]): Promise<void> {
  await scene.update({ [`flags.core.${MAP_LAYERS_FLAG}`]: layers });
}

export function tileLayerOf(document: any, layers: readonly MapLayer[] = sceneLayers(document?.parent)): MapLayer {
  return resolveTileLayer(layers, document?.flags?.core?.[TILE_LAYER_FLAG]);
}

/** Tiles of the scene that are drawn in a layer, including legacy tiles that fall back to it. */
export function tilesInLayer(scene: any, layerId: string): any[] {
  const layers = sceneLayers(scene);
  const tiles: any[] = scene?.getEmbeddedCollection?.("Tile")?.contents ?? [];
  return tiles.filter((tile) => tileLayerOf(tile, layers).id === layerId);
}

export function asLayeredObjects(tiles: readonly any[]): LayeredObject[] {
  return tiles.map((tile) => ({ id: tile.id, sort: Number(tile.sort) || 0 }));
}

/** Where new tiles go: the layer picked in the panel, or the top props layer. */
export function activeLayer(scene: any = canvas?.scene): MapLayer {
  const layers = sceneLayers(scene);
  const chosen = layers.find((layer) => layer.id === activeLayerByScene.get(scene?.id ?? ""));
  return chosen ?? layersInGroup(layers, "props").at(-1) ?? layers[0];
}

export function setActiveLayer(scene: any, layerId: string): void {
  if (!scene?.id) return;
  activeLayerByScene.set(scene.id, layerId);
  Hooks.callAll(MAP_LAYERS_CHANGED_HOOK, scene);
}

export function newLayerId(): string {
  return crypto.getRandomValues(new Uint32Array(3)).reduce((text, part) => text + part.toString(36), "").slice(0, 16);
}
