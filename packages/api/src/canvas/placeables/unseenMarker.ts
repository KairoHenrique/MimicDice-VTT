import * as PIXI from "pixi.js";

const MARKER_FILL = 0x1f2937;
const MARKER_INK = 0xffffff;
const MARKER_SLASH = 0xef4444;

/** Crossed-out eye badge: the GM, looking through a player's token, sees an object that player has not perceived. */
export function createUnseenMarker(radius: number): PIXI.Graphics {
  const marker = new PIXI.Graphics();
  marker.lineStyle(2, 0x000000, 0.8).beginFill(MARKER_FILL, 0.95).drawCircle(0, 0, radius).endFill();
  const eyeWidth = radius * 1.2;
  const eyeHeight = radius * 0.7;
  marker.lineStyle(Math.max(1.5, radius * 0.14), MARKER_INK, 1).drawEllipse(0, 0, eyeWidth / 2, eyeHeight / 2);
  marker.lineStyle(0).beginFill(MARKER_INK, 1).drawCircle(0, 0, radius * 0.2).endFill();
  const slash = radius * 0.62;
  marker.lineStyle(Math.max(2, radius * 0.18), MARKER_SLASH, 1).moveTo(-slash, -slash).lineTo(slash, slash);
  marker.eventMode = "none";
  return marker;
}

export function unseenMarkerRadius(gridSize: number): number {
  return Math.max(12, Math.min(26, Math.round(gridSize * 0.22)));
}
