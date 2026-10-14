import * as PIXI from "pixi.js";
import { CONST } from "../../constants";
import { currentCanvas } from "../../runtime";
import { ControlIcon } from "../containers";
import type { Rectangle } from "../geometry";
import { Ray } from "../geometryClasses";
import { puppetToken, seesEverything } from "../perception/viewpoint";
import { colorToNumber, loadTexture } from "../textures";
import { PlaceableObject } from "./PlaceableObject";

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export class Drawing extends PlaceableObject {
  static override embeddedName = "Drawing";
  shape = new PIXI.Graphics();

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showAuthoredMenu?.(this, event);
  }
  text: PIXI.Text | null = null;

  override get bounds(): Rectangle {
    const shape = this.document.shape ?? {};
    return { x: this.document.x, y: this.document.y, width: Number(shape.width) || 0, height: Number(shape.height) || 0 };
  }

  protected override async _draw(): Promise<void> {
    this.shape = new PIXI.Graphics();
    this.text = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 48, fill: 0xffffff, stroke: 0x111111, strokeThickness: 4, align: "center", wordWrap: true }));
    this.text.anchor.set(0.5);
    this.addChild(this.shape, this.text);
  }

  protected override _refresh(): void {
    const { width, height } = this.bounds;
    this.position.set(this.document.x, this.document.y);
    this.#drawShape(width, height);
    if (this.text) {
      this.text.text = this.document.text ?? "";
      this.text.style.fontSize = Number(this.document.fontSize) || 48;
      this.text.style.fill = colorToNumber(this.document.textColor);
      this.text.style.wordWrapWidth = Math.max(width, 100);
      this.text.alpha = Number(this.document.textAlpha ?? 1);
      this.text.position.set(width / 2, height / 2);
    }
    this.alpha = this.document.hidden ? 0.5 : 1;
    this.angle = Number(this.document.rotation) || 0;
    this.pivot.set(0, 0);
    this.hitArea = new PIXI.Rectangle(Math.min(0, width), Math.min(0, height), Math.abs(width) || 10, Math.abs(height) || 10);
    this.cursor = this.layer?.active ? "pointer" : "default";
  }

  #drawShape(width: number, height: number): void {
    const document = this.document;
    const graphics = this.shape;
    graphics.clear();
    const strokeColor = this.controlled ? 0x3b82f6 : colorToNumber(document.strokeColor);
    graphics.lineStyle(Number(document.strokeWidth) || 0, strokeColor, Number(document.strokeAlpha ?? 1));
    if (Number(document.fillType) !== CONST.DRAWING_FILL_TYPES.NONE) graphics.beginFill(colorToNumber(document.fillColor), Number(document.fillAlpha ?? 0.5));
    switch (document.shape?.type) {
      case CONST.DRAWING_TYPES.ELLIPSE:
        graphics.drawEllipse(width / 2, height / 2, Math.abs(width / 2), Math.abs(height / 2));
        break;
      case CONST.DRAWING_TYPES.POLYGON: {
        const points = (document.shape?.points ?? []) as number[];
        if (points.length >= 4) {
          graphics.moveTo(points[0], points[1]);
          for (let index = 2; index + 1 < points.length; index += 2) graphics.lineTo(points[index], points[index + 1]);
        }
        break;
      }
      case CONST.DRAWING_TYPES.TEXT:
        break;
      default:
        graphics.drawRect(0, 0, width, height);
    }
    graphics.endFill();
  }

  protected override redrawKeys(): string[] {
    return [];
  }
}

const TEMPLATE_ICON = "icons/svg/explosion.svg";
const CONTROL_ICON_SIZE = 40;

export class MeasuredTemplate extends PlaceableObject {
  static override embeddedName = "MeasuredTemplate";
  template = new PIXI.Graphics();

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showAuthoredMenu?.(this, event);
  }
  highlight: PIXI.Graphics | null = null;
  controlIcon: ControlIcon | null = null;
  shape: PIXI.Circle | PIXI.Polygon | PIXI.Rectangle | null = null;
  ray: Ray | null = null;
  texture: PIXI.Texture | null = null;
  _borderThickness = 3;
  ruler: PIXI.Text | null = null;

  get radiusPixels(): number {
    return (Number(this.document.distance) || 0) * currentCanvas().dimensions.distancePixels;
  }

  override get bounds(): Rectangle {
    const radius = this.radiusPixels;
    return { x: this.document.x - radius, y: this.document.y - radius, width: radius * 2, height: radius * 2 };
  }

  override get isVisible(): boolean {
    return !this.document.hidden || seesEverything() || (puppetToken() === null && this.isOwner);
  }

  /** Distances are in pixels and angles in degrees, matching the Foundry static helpers packages call. */
  static getCircleShape(distance: number): PIXI.Circle {
    return new PIXI.Circle(0, 0, distance);
  }

  static getConeShape(distance: number, direction: number, angle: number): PIXI.Polygon {
    const halfAngle = toRadians((Number(angle) || 53.13) / 2);
    const directionRadians = toRadians(Number(direction) || 0);
    const points = [0, 0];
    const steps = 24;
    for (let step = 0; step <= steps; step += 1) {
      const pointAngle = directionRadians - halfAngle + (step * 2 * halfAngle) / steps;
      points.push(Math.cos(pointAngle) * distance, Math.sin(pointAngle) * distance);
    }
    return new PIXI.Polygon(points);
  }

  static getRectShape(distance: number, direction: number): PIXI.Rectangle {
    const directionRadians = toRadians(Number(direction) || 0);
    const width = Math.cos(directionRadians) * distance;
    const height = Math.sin(directionRadians) * distance;
    return new PIXI.Rectangle(Math.min(0, width), Math.min(0, height), Math.abs(width), Math.abs(height));
  }

  static getRayShape(distance: number, direction: number, width: number): PIXI.Polygon {
    const directionRadians = toRadians(Number(direction) || 0);
    const halfWidth = width / 2;
    const normalX = -Math.sin(directionRadians) * halfWidth;
    const normalY = Math.cos(directionRadians) * halfWidth;
    const endX = Math.cos(directionRadians) * distance;
    const endY = Math.sin(directionRadians) * distance;
    return new PIXI.Polygon([normalX, normalY, endX + normalX, endY + normalY, endX - normalX, endY - normalY, -normalX, -normalY]);
  }

  /** Shape relative to the origin, so the hit area and fill share the same geometry. */
  computeShape(): PIXI.Circle | PIXI.Polygon | PIXI.Rectangle {
    const templateClass = this.constructor as typeof MeasuredTemplate;
    const radius = this.radiusPixels;
    const direction = Number(this.document.direction) || 0;
    switch (this.document.t) {
      case CONST.MEASURED_TEMPLATE_TYPES.CONE:
        return templateClass.getConeShape(radius, direction, Number(this.document.angle) || 53.13);
      case CONST.MEASURED_TEMPLATE_TYPES.RECTANGLE:
        return templateClass.getRectShape(radius, direction);
      case CONST.MEASURED_TEMPLATE_TYPES.RAY:
        return templateClass.getRayShape(radius, direction, (Number(this.document.width) || 1) * currentCanvas().dimensions.distancePixels);
      default:
        return templateClass.getCircleShape(radius);
    }
  }

  get highlightId(): string {
    return `MeasuredTemplate.${this.document.id}`;
  }

  protected override async _draw(): Promise<void> {
    this.texture = this.document.texture ? await loadTexture(this.document.texture) : null;
    const highlight: PIXI.Graphics = currentCanvas().gridLayer?.getHighlightLayer?.(this.highlightId) ?? new PIXI.Graphics();
    this.highlight = highlight;
    this.template = new PIXI.Graphics();
    this.controlIcon = new ControlIcon({ texture: TEMPLATE_ICON, size: CONTROL_ICON_SIZE });
    this.ruler = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 26, fill: 0xffffff, stroke: 0x111111, strokeThickness: 4 }));
    this.ruler.anchor.set(0.5, 1);
    this.ruler.position.set(0, -CONTROL_ICON_SIZE / 2 - 4);
    this.addChild(highlight, this.template, this.controlIcon, this.ruler);
  }

  /** Same step order as Foundry (shape, state, outline, highlight) so package wrappers see the fields they expect. */
  protected override _refresh(): void {
    this._refreshShape();
    this._refreshState();
    this._refreshTemplate();
    this.highlightGrid();
  }

  /** Keeps `shape` as the exact object drawn into `template`, which packages compare by identity. */
  _refreshShape(): void {
    this.shape = this.computeShape();
    this.ray = Ray.fromAngle(0, 0, toRadians(Number(this.document.direction) || 0), this.radiusPixels);
    this.hitArea = this.shape;
  }

  _refreshState(): void {
    this.position.set(this.document.x, this.document.y);
    if (this.ruler) {
      this.ruler.text = `${Number(this.document.distance) || 0}${currentCanvas().dimensions.units}`;
      this.ruler.visible = this.hover || this.controlled;
    }
    this.alpha = this.document.hidden ? 0.5 : 1;
    this.cursor = this.layer?.active ? "pointer" : "default";
    if (this.controlIcon) {
      this.controlIcon.visible = Boolean(this.layer?.active);
      this.controlIcon.border.visible = this.hover || this.controlled;
    }
  }

  /** Outline (or texture) of the area; the translucent color fill is drawn by `highlightGrid`. */
  _refreshTemplate(): void {
    if (!this.shape) return;
    const borderColor = this.controlled ? 0x3b82f6 : colorToNumber(this.document.borderColor, 0x000000);
    this.template.clear().lineStyle(this._borderThickness, borderColor, 0.9);
    if (this.texture) this.template.beginTextureFill({ texture: this.texture, alpha: 1 });
    else this.template.beginFill(0x000000, 0);
    this.template.drawShape(this.shape).endFill();
  }

  highlightGrid(): void {
    if (!this.highlight || this.highlight.destroyed || !this.shape) return;
    this.highlight.clear().beginFill(colorToNumber(this.document.fillColor, 0xff6400), 0.3).drawShape(this.shape).endFill();
  }

  override destroy(options?: boolean | PIXI.IDestroyOptions): void {
    currentCanvas()?.gridLayer?.destroyHighlightLayer?.(this.highlightId);
    super.destroy(options);
  }

  override get snapMode(): "corner" | "center" | "half" {
    return "half";
  }

  protected override redrawKeys(): string[] {
    return [];
  }

  override _onClickLeft2(): void {}
}
