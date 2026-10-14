import type { PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import type { Point } from "../geometry";
import type { SceneDimensions, SquareGrid } from "../grid";

export interface CreationContext {
  grid: SquareGrid;
  dimensions: SceneDimensions;
  snap: boolean;
}

export interface CreationTool {
  documentName: string;
  /** Minimum drag in pixels before the tool creates anything; 0 means a click is enough. */
  minimumDrag: number;
  snapMode: "corner" | "center" | "half";
  /** Only a pressed-and-held drag creates it, so stray clicks never leave objects behind. */
  requiresHold?: boolean;
  build(origin: Point, destination: Point, context: CreationContext, freehandPoints?: number[]): PlainObject | null;
}

const MIN_SHAPE_SIZE = 8;

function rectangleBetween(origin: Point, destination: Point) {
  return {
    x: Math.round(Math.min(origin.x, destination.x)),
    y: Math.round(Math.min(origin.y, destination.y)),
    width: Math.round(Math.abs(destination.x - origin.x)),
    height: Math.round(Math.abs(destination.y - origin.y)),
  };
}

function wallTool(door: number): CreationTool {
  return {
    documentName: "Wall",
    minimumDrag: MIN_SHAPE_SIZE,
    snapMode: "corner",
    requiresHold: true,
    build: (origin, destination) => ({ c: [origin.x, origin.y, destination.x, destination.y].map(Math.round), door, ds: CONST.WALL_DOOR_STATES.CLOSED }),
  };
}

function drawingTool(type: string): CreationTool {
  return {
    documentName: "Drawing",
    minimumDrag: type === CONST.DRAWING_TYPES.TEXT ? 0 : MIN_SHAPE_SIZE,
    snapMode: "corner",
    build: (origin, destination, _context, freehandPoints) => {
      if (type === CONST.DRAWING_TYPES.POLYGON) {
        const points = freehandPoints ?? [];
        if (points.length < 4) return null;
        const xs = points.filter((_value, index) => index % 2 === 0);
        const ys = points.filter((_value, index) => index % 2 === 1);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const relative = points.map((value, index) => Math.round(value - (index % 2 === 0 ? left : top)));
        return { x: Math.round(left), y: Math.round(top), shape: { type, width: Math.round(Math.max(...xs) - left), height: Math.round(Math.max(...ys) - top), points: relative }, fillType: CONST.DRAWING_FILL_TYPES.NONE };
      }
      if (type === CONST.DRAWING_TYPES.TEXT) {
        return { x: Math.round(origin.x), y: Math.round(origin.y), shape: { type, width: 400, height: 100 }, fillType: CONST.DRAWING_FILL_TYPES.NONE, strokeWidth: 0 };
      }
      const area = rectangleBetween(origin, destination);
      return { x: area.x, y: area.y, shape: { type, width: area.width, height: area.height }, fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillAlpha: 0.25 };
    },
  };
}

function templateTool(type: string): CreationTool {
  return {
    documentName: "MeasuredTemplate",
    minimumDrag: MIN_SHAPE_SIZE,
    snapMode: "half",
    build: (origin, destination, context) => {
      const distance = Math.round((Math.hypot(destination.x - origin.x, destination.y - origin.y) / context.dimensions.distancePixels) * 10) / 10;
      const direction = Math.round(((Math.atan2(destination.y - origin.y, destination.x - origin.x) * 180) / Math.PI + 360) % 360);
      return { t: type, x: Math.round(origin.x), y: Math.round(origin.y), distance, direction, width: context.grid.distance };
    },
  };
}

const lightTool: CreationTool = {
  documentName: "AmbientLight",
  minimumDrag: 0,
  snapMode: "half",
  build: (origin, _destination, context) => ({
    x: Math.round(origin.x),
    y: Math.round(origin.y),
    config: { dim: context.grid.distance * 6, bright: context.grid.distance * 3, color: "#ffd27a", alpha: 0.5 },
  }),
};

const tileTool: CreationTool = {
  documentName: "Tile",
  minimumDrag: 0,
  snapMode: "corner",
  build: (origin, destination, context) => {
    const area = rectangleBetween(origin, destination);
    const size = context.grid.size;
    return { x: area.x, y: area.y, width: Math.max(area.width, size), height: Math.max(area.height, size) };
  },
};

const noteTool: CreationTool = {
  documentName: "Note",
  minimumDrag: 0,
  snapMode: "center",
  build: (origin) => ({ x: Math.round(origin.x), y: Math.round(origin.y) }),
};

/** Tool name (as in the v13 scene controls) to creation behaviour, scoped by layer name. */
export const CREATION_TOOLS: Record<string, Record<string, CreationTool>> = {
  walls: { walls: wallTool(CONST.WALL_DOOR_TYPES.NONE), door: wallTool(CONST.WALL_DOOR_TYPES.DOOR) },
  drawings: {
    rect: drawingTool(CONST.DRAWING_TYPES.RECTANGLE),
    ellipse: drawingTool(CONST.DRAWING_TYPES.ELLIPSE),
    freehand: drawingTool(CONST.DRAWING_TYPES.POLYGON),
    text: drawingTool(CONST.DRAWING_TYPES.TEXT),
  },
  templates: {
    circle: templateTool(CONST.MEASURED_TEMPLATE_TYPES.CIRCLE),
    cone: templateTool(CONST.MEASURED_TEMPLATE_TYPES.CONE),
    rect: templateTool(CONST.MEASURED_TEMPLATE_TYPES.RECTANGLE),
    ray: templateTool(CONST.MEASURED_TEMPLATE_TYPES.RAY),
  },
  lighting: { light: lightTool },
  tiles: { tile: tileTool },
  notes: { journal: noteTool },
};
