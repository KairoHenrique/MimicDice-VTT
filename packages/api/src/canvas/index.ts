import { CanvasAnimation } from "./animation";
import { Canvas } from "./Canvas";
import { ControlsLayer, EffectsCanvasGroup, InterfaceCanvasGroup, PrimaryCanvasGroup } from "./compatGroups";
import { createContainersNamespace } from "./containers";
import * as geometry from "./geometry";
import { ClockwiseSweepPolygon, Ray } from "./geometryClasses";
import { SquareGrid } from "./grid";
import { CanvasLayer, InteractionLayer, PlaceablesLayer } from "./layers/CanvasLayer";
import { DrawingsLayer, GridLayer, LightingLayer, NotesLayer, TemplateLayer, TilesLayer, TokenLayer, WallsLayer } from "./layers/placeableLayers";
import { VisibilityLayer } from "./perception/VisibilityLayer";
import { PlaceableObject } from "./placeables/PlaceableObject";
import { Region, RegionMesh } from "./placeables/Region";
import { Drawing, MeasuredTemplate } from "./placeables/shapePlaceables";
import { AmbientLight, Note, Tile, Wall } from "./placeables/simplePlaceables";
import { Token } from "./placeables/Token";
import { createRenderingNamespace } from "./rendering";
import { loadTexture } from "./textures";

export { Canvas };

export const PLACEABLE_CLASSES = { Token, Tile, Wall, AmbientLight, Note, Drawing, MeasuredTemplate };

export const CANVAS_LAYER_CLASSES = {
  TokenLayer,
  TilesLayer,
  WallsLayer,
  LightingLayer,
  NotesLayer,
  DrawingsLayer,
  TemplateLayer,
  GridLayer,
  VisibilityLayer,
};

/** The `foundry.canvas` namespace exposed to packages. */
export function createCanvasNamespace() {
  return {
    Canvas,
    loadTexture,
    animation: { CanvasAnimation },
    containers: createContainersNamespace(),
    geometry: { ...geometry, Ray, ClockwiseSweepPolygon },
    grid: { SquareGrid, BaseGrid: SquareGrid },
    layers: { CanvasLayer, InteractionLayer, PlaceablesLayer, ControlsLayer, ...CANVAS_LAYER_CLASSES },
    placeables: { PlaceableObject, ...PLACEABLE_CLASSES, Region, regions: { RegionMesh } },
    groups: { EffectsCanvasGroup, PrimaryCanvasGroup, InterfaceCanvasGroup },
    rendering: createRenderingNamespace(),
    perception: {},
  };
}
