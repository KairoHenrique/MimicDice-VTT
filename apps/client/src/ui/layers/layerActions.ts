import { DialogV2 } from "@tabbletop/api";
import {
  canAddLayer,
  DEFAULT_LAYER_NAMES,
  layerBelow,
  layersInGroup,
  type MapLayer,
  type MapLayerGroup,
  MAX_LAYER_NAME_LENGTH,
  MAX_LAYERS_PER_GROUP,
  moveToLayerUpdates,
  type ObjectOrderAction,
  objectOrderUpdates,
  withAddedLayer,
  withMovedLayer,
  withoutLayer,
  withUpdatedLayer,
} from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { asLayeredObjects, newLayerId, saveSceneLayers, sceneLayers, setActiveLayer, tileLayerOf, tilesInLayer } from "./layerStore";

async function guarded(action: () => Promise<unknown>, failure: string): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    console.error("MimicDice | Camadas", error);
    ui.notifications.error(failure);
    return false;
  }
}

async function askLayerName(title: string, current: string): Promise<string | null> {
  const input = h("input", { type: "text", value: current, maxlength: MAX_LAYER_NAME_LENGTH, "aria-label": "Nome da camada", required: true });
  const name = await DialogV2.prompt({ window: { title }, content: h("div", {}, input), ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => input.value } });
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed ? trimmed.slice(0, MAX_LAYER_NAME_LENGTH) : null;
}

export async function addLayer(scene: any, group: MapLayerGroup): Promise<void> {
  const layers = sceneLayers(scene);
  if (!canAddLayer(layers, group)) {
    ui.notifications.warn(`Cada grupo aceita até ${MAX_LAYERS_PER_GROUP} camadas.`);
    return;
  }
  const suggestion = `${DEFAULT_LAYER_NAMES[group]} ${layersInGroup(layers, group).length + 1}`;
  const name = await askLayerName("Nova camada", suggestion);
  if (!name) return;
  const layer: MapLayer = { id: newLayerId(), name, group, visible: true, locked: false, opacity: 1 };
  await guarded(async () => {
    await saveSceneLayers(scene, withAddedLayer(sceneLayers(scene), layer));
    setActiveLayer(scene, layer.id);
  }, "Não foi possível criar a camada.");
}

export async function renameLayer(scene: any, layer: MapLayer): Promise<void> {
  const name = await askLayerName("Renomear camada", layer.name);
  if (name && name !== layer.name) await updateLayer(scene, layer.id, { name });
}

export async function updateLayer(scene: any, layerId: string, changes: Partial<Pick<MapLayer, "name" | "visible" | "locked" | "opacity">>): Promise<void> {
  await guarded(() => saveSceneLayers(scene, withUpdatedLayer(sceneLayers(scene), layerId, changes)), "Não foi possível alterar a camada.");
}

export async function moveLayer(scene: any, layerId: string, direction: "up" | "down"): Promise<void> {
  await guarded(() => saveSceneLayers(scene, withMovedLayer(sceneLayers(scene), layerId, direction)), "Não foi possível mover a camada.");
}

/** Like "merge down": the layer's objects go on top of the layer below, which keeps its own settings. */
export async function mergeLayerDown(scene: any, layer: MapLayer): Promise<void> {
  const layers = sceneLayers(scene);
  const target = layerBelow(layers, layer.id);
  if (!target) return;
  const updates = moveToLayerUpdates(asLayeredObjects(tilesInLayer(scene, layer.id)), asLayeredObjects(tilesInLayer(scene, target.id)), target.id);
  const merged = await guarded(async () => {
    if (updates.length > 0) await scene.updateEmbeddedDocuments("Tile", updates);
    await saveSceneLayers(scene, withoutLayer(sceneLayers(scene), layer.id));
    setActiveLayer(scene, target.id);
  }, "Não foi possível mesclar as camadas.");
  if (merged) ui.notifications.info(`"${layer.name}" foi mesclada em "${target.name}".`);
}

export async function deleteLayer(scene: any, layer: MapLayer): Promise<void> {
  const tiles = tilesInLayer(scene, layer.id);
  if (tiles.length > 0) {
    const confirmed = await DialogV2.confirm({
      window: { title: "Apagar camada" },
      content: h("p", {}, `Apagar a camada "${layer.name}" e os ${tiles.length} objeto(s) dela? Para guardar os objetos, mescle a camada em vez de apagar.`),
      yes: { label: "Apagar" },
      no: { label: "Cancelar" },
    });
    if (!confirmed) return;
  }
  await guarded(async () => {
    if (tiles.length > 0) await scene.deleteEmbeddedDocuments("Tile", tiles.map((tile) => tile.id));
    await saveSceneLayers(scene, withoutLayer(sceneLayers(scene), layer.id));
  }, "Não foi possível apagar a camada.");
}

export async function reorderTile(tile: any, action: ObjectOrderAction): Promise<void> {
  const document = tile.document ?? tile;
  const scene = document.parent;
  const siblings = tilesInLayer(scene, tileLayerOf(document).id);
  const updates = objectOrderUpdates(asLayeredObjects(siblings), document.id, action);
  if (updates.length > 0) await guarded(() => scene.updateEmbeddedDocuments("Tile", updates), "Não foi possível mudar a ordem.");
}

export async function moveTileToLayer(tile: any, target: MapLayer): Promise<void> {
  const document = tile.document ?? tile;
  const scene = document.parent;
  const updates = moveToLayerUpdates(asLayeredObjects([document]), asLayeredObjects(tilesInLayer(scene, target.id)), target.id);
  await guarded(() => scene.updateEmbeddedDocuments("Tile", updates), "Não foi possível mover para a camada.");
}
