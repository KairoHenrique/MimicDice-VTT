import { describe, expect, it } from "vitest";
import {
  defaultMapLayers,
  layerBelow,
  type MapLayer,
  MAX_LAYERS_PER_GROUP,
  moveToLayerUpdates,
  objectOrderUpdates,
  parseMapLayers,
  resolveTileLayer,
  stackingOrder,
  withAddedLayer,
  withMovedLayer,
  withoutLayer,
  withUpdatedLayer,
} from "./mapLayers.js";

const layer = (id: string, group: MapLayer["group"], extra: Partial<MapLayer> = {}): MapLayer => ({ id, name: id, group, visible: true, locked: false, opacity: 1, ...extra });

describe("parseMapLayers", () => {
  it("starts every scene with a ground layer and a props layer", () => {
    expect(parseMapLayers(undefined).map((entry) => entry.group)).toEqual(["map", "props"]);
  });

  it("drops invalid and duplicate entries but keeps the valid ones in order", () => {
    const parsed = parseMapLayers([layer("a", "map"), { id: "bad id!", name: "x", group: "map" }, layer("a", "props"), layer("b", "props", { opacity: 0.5 }), { id: "c", name: "", group: "props" }]);
    expect(parsed.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(parsed[1].opacity).toBe(0.5);
  });

  it("caps each group", () => {
    const many = Array.from({ length: MAX_LAYERS_PER_GROUP + 5 }, (_, index) => layer(`p${index}`, "props"));
    expect(parseMapLayers(many).filter((entry) => entry.group === "props")).toHaveLength(MAX_LAYERS_PER_GROUP);
  });
});

describe("stacking", () => {
  const layers = [layer("ground", "map"), layer("decals", "map"), layer("furniture", "props"), layer("roof", "props")];

  it("puts props above the map and higher layers above lower ones, whatever the object order", () => {
    const groundTop = stackingOrder(layers, layers[0], 9_999_999);
    const decalsBottom = stackingOrder(layers, layers[1], 0);
    const furnitureBottom = stackingOrder(layers, layers[2], 0);
    expect(groundTop).toBeLessThan(decalsBottom);
    expect(stackingOrder(layers, layers[1], 50)).toBeLessThan(furnitureBottom);
    expect(furnitureBottom).toBeLessThan(stackingOrder(layers, layers[3], 0));
  });

  it("sends tiles without a layer (or with a deleted one) to the bottom map layer", () => {
    expect(resolveTileLayer(layers, undefined).id).toBe("ground");
    expect(resolveTileLayer(layers, "gone").id).toBe("ground");
    expect(resolveTileLayer(layers, "roof").id).toBe("roof");
  });
});

describe("layer editing", () => {
  const layers = defaultMapLayers();

  it("adds new layers on top of their group", () => {
    const added = withAddedLayer(layers, layer("detail", "map"));
    expect(added.map((entry) => entry.id)).toEqual(["defaultmap", "detail", "defaultprops"]);
  });

  it("moves a layer only within its group", () => {
    const two = withAddedLayer(layers, layer("detail", "map"));
    expect(withMovedLayer(two, "detail", "down").map((entry) => entry.id)).toEqual(["detail", "defaultmap", "defaultprops"]);
    expect(withMovedLayer(two, "detail", "up")).toEqual(two);
  });

  it("never removes the last layer of a group", () => {
    expect(withoutLayer(layers, "defaultmap")).toEqual(layers);
    const two = withAddedLayer(layers, layer("detail", "map"));
    expect(withoutLayer(two, "detail")).toEqual(layers);
  });

  it("validates changes", () => {
    expect(withUpdatedLayer(layers, "defaultmap", { opacity: 0.4, locked: true })[0]).toMatchObject({ opacity: 0.4, locked: true });
    expect(withUpdatedLayer(layers, "defaultmap", { opacity: 7 })[0].opacity).toBe(1);
    expect(withUpdatedLayer(layers, "defaultmap", { name: "   " })[0].name).toBe("Chão");
  });

  it("finds the layer a merge goes into", () => {
    const two = withAddedLayer(layers, layer("detail", "map"));
    expect(layerBelow(two, "detail")?.id).toBe("defaultmap");
    expect(layerBelow(two, "defaultmap")).toBeNull();
    expect(layerBelow(two, "defaultprops")).toBeNull();
  });
});

describe("object order", () => {
  const objects = [
    { id: "a", sort: 0 },
    { id: "b", sort: 1 },
    { id: "c", sort: 2 },
  ];

  it("brings forward, sends backward, to front and to back, updating only what changed", () => {
    expect(objectOrderUpdates(objects, "a", "forward")).toEqual([
      { _id: "b", sort: 0 },
      { _id: "a", sort: 1 },
    ]);
    expect(objectOrderUpdates(objects, "a", "front")).toEqual([
      { _id: "b", sort: 0 },
      { _id: "c", sort: 1 },
      { _id: "a", sort: 2 },
    ]);
    expect(objectOrderUpdates(objects, "c", "back")).toEqual([
      { _id: "c", sort: 0 },
      { _id: "a", sort: 1 },
      { _id: "b", sort: 2 },
    ]);
    expect(objectOrderUpdates(objects, "a", "backward")).toEqual([]);
  });

  it("merges objects on top of the target layer, keeping their order", () => {
    const updates = moveToLayerUpdates([{ id: "y", sort: 4 }, { id: "x", sort: 1 }], [{ id: "t", sort: 7 }], "below");
    expect(updates).toEqual([
      { _id: "x", sort: 8, flags: { core: { layerId: "below" } } },
      { _id: "y", sort: 9, flags: { core: { layerId: "below" } } },
    ]);
  });
});
