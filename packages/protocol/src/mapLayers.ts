import { z } from "zod";

/** Scene flag (scope "core") holding the GM's map and prop layers, bottom to top. */
export const MAP_LAYERS_FLAG = "mapLayers";
/** Tile flag (scope "core") naming the layer a tile belongs to. */
export const TILE_LAYER_FLAG = "layerId";

export const MAP_LAYER_GROUPS = ["map", "props"] as const;
export type MapLayerGroup = (typeof MAP_LAYER_GROUPS)[number];

export const MAX_LAYERS_PER_GROUP = 20;
export const MAX_LAYER_NAME_LENGTH = 40;
/** Room for this many objects per layer before their stacking spills into the next layer. */
const OBJECTS_PER_LAYER_SLOT = 10_000;
const LAYERS_PER_GROUP_SLOT = 100;

const layerIdSchema = z.string().regex(/^[A-Za-z0-9]{1,24}$/);

export const mapLayerSchema = z.object({
  id: layerIdSchema,
  name: z.string().trim().min(1).max(MAX_LAYER_NAME_LENGTH),
  group: z.enum(MAP_LAYER_GROUPS),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
});
export type MapLayer = z.infer<typeof mapLayerSchema>;

export const DEFAULT_LAYER_NAMES: Readonly<Record<MapLayerGroup, string>> = Object.freeze({ map: "Chão", props: "Objetos" });

export function defaultMapLayers(): MapLayer[] {
  return MAP_LAYER_GROUPS.map((group) => ({ id: `default${group}`, name: DEFAULT_LAYER_NAMES[group], group, visible: true, locked: false, opacity: 1 }));
}

/** Valid layers from a stored flag: bad entries and duplicate ids are dropped, and every group keeps at least one layer. */
export function parseMapLayers(raw: unknown): MapLayer[] {
  const layers: MapLayer[] = [];
  const seen = new Set<string>();
  const perGroup = new Map<MapLayerGroup, number>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    const parsed = mapLayerSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    const count = perGroup.get(parsed.data.group) ?? 0;
    if (count >= MAX_LAYERS_PER_GROUP) continue;
    seen.add(parsed.data.id);
    perGroup.set(parsed.data.group, count + 1);
    layers.push(parsed.data);
  }
  for (const fallback of defaultMapLayers()) {
    if (!perGroup.has(fallback.group) && !seen.has(fallback.id)) layers.push(fallback);
  }
  return layers;
}

/** Layers of one group, bottom to top. */
export function layersInGroup(layers: readonly MapLayer[], group: MapLayerGroup): MapLayer[] {
  return layers.filter((layer) => layer.group === group);
}

/** The layer a tile is drawn in: its own when it still exists, otherwise the bottom map layer (tiles placed before layers existed). */
export function resolveTileLayer(layers: readonly MapLayer[], layerId: unknown): MapLayer {
  const own = typeof layerId === "string" ? layers.find((layer) => layer.id === layerId) : undefined;
  return own ?? layersInGroup(layers, "map")[0] ?? layers[0] ?? defaultMapLayers()[0];
}

/** Stacking value for a tile: map layers under prop layers, each layer above the ones below it, then the tile's own order. */
export function stackingOrder(layers: readonly MapLayer[], layer: MapLayer, sort: number): number {
  const groupIndex = MAP_LAYER_GROUPS.indexOf(layer.group);
  const layerIndex = Math.max(0, layersInGroup(layers, layer.group).findIndex((candidate) => candidate.id === layer.id));
  const ownOrder = Math.min(Math.max(Math.trunc(Number(sort) || 0), 0), OBJECTS_PER_LAYER_SLOT - 1);
  return (groupIndex * LAYERS_PER_GROUP_SLOT + layerIndex) * OBJECTS_PER_LAYER_SLOT + ownOrder;
}

export function canAddLayer(layers: readonly MapLayer[], group: MapLayerGroup): boolean {
  return layersInGroup(layers, group).length < MAX_LAYERS_PER_GROUP;
}

/** New layer on top of its group. */
export function withAddedLayer(layers: readonly MapLayer[], layer: MapLayer): MapLayer[] {
  if (!canAddLayer(layers, layer.group)) return [...layers];
  const lastIndexOfGroup = layers.reduce((found, candidate, index) => (candidate.group === layer.group ? index : found), -1);
  const next = [...layers];
  next.splice(lastIndexOfGroup + 1, 0, layer);
  return next;
}

export function withUpdatedLayer(layers: readonly MapLayer[], layerId: string, changes: Partial<Omit<MapLayer, "id" | "group">>): MapLayer[] {
  return layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    const parsed = mapLayerSchema.safeParse({ ...layer, ...changes });
    return parsed.success ? parsed.data : layer;
  });
}

/** Swaps a layer with its neighbour in the same group; "up" brings it to the front. */
export function withMovedLayer(layers: readonly MapLayer[], layerId: string, direction: "up" | "down"): MapLayer[] {
  const layer = layers.find((candidate) => candidate.id === layerId);
  if (!layer) return [...layers];
  const group = layersInGroup(layers, layer.group);
  const position = group.indexOf(layer);
  const neighbour = group[direction === "up" ? position + 1 : position - 1];
  if (!neighbour) return [...layers];
  return layers.map((candidate) => (candidate === layer ? neighbour : candidate === neighbour ? layer : candidate));
}

export function canRemoveLayer(layers: readonly MapLayer[], layerId: string): boolean {
  const layer = layers.find((candidate) => candidate.id === layerId);
  return Boolean(layer) && layersInGroup(layers, (layer as MapLayer).group).length > 1;
}

export function withoutLayer(layers: readonly MapLayer[], layerId: string): MapLayer[] {
  return canRemoveLayer(layers, layerId) ? layers.filter((layer) => layer.id !== layerId) : [...layers];
}

/** The layer right below in the same group, which receives the objects when merging; null for the bottom layer. */
export function layerBelow(layers: readonly MapLayer[], layerId: string): MapLayer | null {
  const layer = layers.find((candidate) => candidate.id === layerId);
  if (!layer) return null;
  const group = layersInGroup(layers, layer.group);
  return group[group.indexOf(layer) - 1] ?? null;
}

export interface LayeredObject {
  id: string;
  sort: number;
}

export interface ObjectOrderUpdate {
  _id: string;
  sort: number;
}

export type ObjectOrderAction = "front" | "forward" | "backward" | "back";

function byStacking(objects: readonly LayeredObject[]): LayeredObject[] {
  return [...objects].sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id));
}

/** Renumbers a layer's objects 0..n-1 and returns only the ones whose order changed. */
function renumbered(ordered: readonly LayeredObject[]): ObjectOrderUpdate[] {
  return ordered.flatMap((object, index) => (object.sort === index ? [] : [{ _id: object.id, sort: index }]));
}

/** Raises or lowers one object among the others of its layer, like "bring forward" in an image editor. */
export function objectOrderUpdates(objectsInLayer: readonly LayeredObject[], objectId: string, action: ObjectOrderAction): ObjectOrderUpdate[] {
  const ordered = byStacking(objectsInLayer);
  const index = ordered.findIndex((object) => object.id === objectId);
  if (index < 0) return [];
  const [object] = ordered.splice(index, 1);
  const target = { front: ordered.length, back: 0, forward: Math.min(index + 1, ordered.length), backward: Math.max(index - 1, 0) }[action];
  ordered.splice(target, 0, object);
  return renumbered(ordered);
}

/** Moves objects into another layer, on top of what it already holds, keeping their relative order. */
export function moveToLayerUpdates(moving: readonly LayeredObject[], targetObjects: readonly LayeredObject[], targetLayerId: string): Array<ObjectOrderUpdate & { flags: { core: { layerId: string } } }> {
  const movingIds = new Set(moving.map((object) => object.id));
  const base = targetObjects.reduce((top, object) => (movingIds.has(object.id) ? top : Math.max(top, object.sort + 1)), 0);
  return byStacking(moving).map((object, index) => ({ _id: object.id, sort: base + index, flags: { core: { [TILE_LAYER_FLAG]: targetLayerId } as { layerId: string } } }));
}
