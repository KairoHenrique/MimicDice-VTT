import type * as PIXI from "pixi.js";
import type { PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import type { Point } from "../geometry";
import { colorToNumber } from "../textures";
import type { CreationContext, CreationTool } from "./creationTools";

const PREVIEW_COLOR = 0x3b82f6;
const PREVIEW_LINE_WIDTH = 3;
const PREVIEW_FILL_ALPHA = 0.15;
const DEFAULT_CONE_ANGLE = 53.13;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** An open stroke through the sampled points; closing it would draw a line from the pointer back to the start. */
function paintPolyline(graphics: PIXI.Graphics, originX: number, originY: number, points: readonly number[]): void {
  if (points.length < 4) return;
  graphics.moveTo(originX + points[0], originY + points[1]);
  for (let index = 2; index + 1 < points.length; index += 2) graphics.lineTo(originX + points[index], originY + points[index + 1]);
}

function paintDrawing(graphics: PIXI.Graphics, data: PlainObject, color: number): void {
  const shape = (data.shape ?? {}) as PlainObject;
  const x = Number(data.x);
  const y = Number(data.y);
  const width = Number(shape.width) || 0;
  const height = Number(shape.height) || 0;
  graphics.lineStyle(PREVIEW_LINE_WIDTH, color, 1);
  switch (shape.type) {
    case CONST.DRAWING_TYPES.POLYGON:
      paintPolyline(graphics, x, y, (shape.points ?? []) as number[]);
      return;
    case CONST.DRAWING_TYPES.ELLIPSE:
      graphics.beginFill(color, PREVIEW_FILL_ALPHA).drawEllipse(x + width / 2, y + height / 2, width / 2, height / 2).endFill();
      return;
    case CONST.DRAWING_TYPES.TEXT:
      graphics.lineStyle(1, color, 0.8).drawRect(x, y, width, height);
      return;
    default:
      graphics.beginFill(color, PREVIEW_FILL_ALPHA).drawRect(x, y, width, height).endFill();
  }
}

function paintTemplate(graphics: PIXI.Graphics, data: PlainObject, context: CreationContext): void {
  const pixelsPerUnit = context.dimensions.distancePixels;
  const x = Number(data.x);
  const y = Number(data.y);
  const length = Number(data.distance) * pixelsPerUnit;
  const direction = toRadians(Number(data.direction) || 0);
  const end = { x: x + Math.cos(direction) * length, y: y + Math.sin(direction) * length };
  graphics.lineStyle(PREVIEW_LINE_WIDTH, 0xff6400, 1).beginFill(0xff6400, 0.25);
  switch (data.t) {
    case CONST.MEASURED_TEMPLATE_TYPES.CONE: {
      const half = toRadians(DEFAULT_CONE_ANGLE / 2);
      graphics.moveTo(x, y).arc(x, y, length, direction - half, direction + half).lineTo(x, y);
      break;
    }
    case CONST.MEASURED_TEMPLATE_TYPES.RECTANGLE:
      graphics.drawRect(Math.min(x, end.x), Math.min(y, end.y), Math.abs(end.x - x), Math.abs(end.y - y));
      break;
    case CONST.MEASURED_TEMPLATE_TYPES.RAY: {
      const halfWidth = (Number(data.width) * pixelsPerUnit) / 2;
      const normal = { x: -Math.sin(direction) * halfWidth, y: Math.cos(direction) * halfWidth };
      graphics.drawPolygon([x + normal.x, y + normal.y, end.x + normal.x, end.y + normal.y, end.x - normal.x, end.y - normal.y, x - normal.x, y - normal.y]);
      break;
    }
    default:
      graphics.drawCircle(x, y, length);
  }
  graphics.endFill();
}

/** Ghost of what releasing the pointer would create, in the exact shape the tool builds. */
export function paintCreationPreview(graphics: PIXI.Graphics, tool: CreationTool, origin: Point, destination: Point, context: CreationContext, points: readonly number[], userColor: unknown): void {
  if (tool.documentName === "Wall") {
    graphics.lineStyle(PREVIEW_LINE_WIDTH, PREVIEW_COLOR, 1).moveTo(origin.x, origin.y).lineTo(destination.x, destination.y);
    return;
  }
  const data = tool.build(origin, destination, context, [...points]);
  if (!data) return;
  if (tool.documentName === "Drawing") paintDrawing(graphics, data, colorToNumber(userColor, PREVIEW_COLOR));
  else if (tool.documentName === "MeasuredTemplate") paintTemplate(graphics, data, context);
  else graphics.lineStyle(PREVIEW_LINE_WIDTH, PREVIEW_COLOR, 1).beginFill(PREVIEW_COLOR, PREVIEW_FILL_ALPHA).drawRect(Math.min(origin.x, destination.x), Math.min(origin.y, destination.y), Math.abs(destination.x - origin.x), Math.abs(destination.y - origin.y)).endFill();
}
