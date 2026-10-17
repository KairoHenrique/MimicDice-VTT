import * as PIXI from "pixi.js";
import type { PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import { currentCanvas, currentGame } from "../../runtime";
import type { Point, Rectangle } from "../geometry";
import { colorToNumber, loadTexture } from "../textures";
import { puppetToken, seesEverything } from "../perception/viewpoint";
import { PlaceableObject } from "./PlaceableObject";

const MOVE_SQUARES_PER_SECOND = 6;
const MAX_MOVE_DURATION_MS = 2_000;
const LIVE_DRAG_EASE_MS = 80;
const DISPOSITION_COLORS: Record<number, number> = { [-2]: 0xa612d4, [-1]: 0xe72124, 0: 0xf1d836, 1: 0x43dfdf };

/** A small colored disc over the token, e.g. a condition: one glyph (icon font or emoji) on a background color. */
export interface TokenBadge {
  text: string;
  color: string;
  fontFamily?: string;
  fontWeight?: string;
}

interface MoveAnimation {
  from: Point;
  to: Point;
  startedAt: number;
  duration: number;
}

export class Token extends PlaceableObject {
  static override embeddedName = "Token";
  /** Table rules for dragging tokens the user does not control; the server enforces the same rules. */
  static dragWithoutControlRule: ((token: Token, user: any) => boolean) | null = null;

  /** Badges drawn along the token's top edge. */
  static badgesRule: ((token: Token) => TokenBadge[]) | null = null;

  mesh: PIXI.Sprite | null = null;
  border = new PIXI.Graphics();
  bars = new PIXI.Graphics();
  badges = new PIXI.Container();
  nameplate: PIXI.Text | null = null;
  #badgeSignature = "";
  #animation: MoveAnimation | null = null;
  #animationTick = () => this.#stepAnimation();
  #livePosition: Point | null = null;
  #dragLabel: PIXI.Text | null = null;

  get w(): number {
    return Number(this.document.width) * currentCanvas().grid.size;
  }

  get h(): number {
    return Number(this.document.height) * currentCanvas().grid.size;
  }

  override get bounds(): Rectangle {
    return { x: this.position.x, y: this.position.y, width: this.w, height: this.h };
  }

  get actor(): any {
    return this.document.actor;
  }

  get name(): string {
    if (this.document.isLinked && this.actor?.name) return String(this.actor.name);
    return String(this.document.name ?? "");
  }

  get isVisible(): boolean {
    if (seesEverything() || this === puppetToken()) return true;
    if (this.document.hidden) return false;
    return currentCanvas()?.perception?.isTokenVisible?.(this) ?? true;
  }

  override canDragWithoutControl(user: any): boolean {
    if (!user || user.isGM || !this.isVisible) return false;
    return Token.dragWithoutControlRule?.(this, user) === true;
  }

  get hasSight(): boolean {
    return this.document.sight?.enabled === true || this.isOwner;
  }

  /** Movement constraints applied while dragging; packages wrap this to relax or tighten wall checks. */
  _getDragConstrainOptions(): { type: "move"; ignoreWalls: boolean; ignoreCost: boolean } {
    return { type: "move", ignoreWalls: Boolean(currentGame()?.user?.isGM && currentGame()?.keyboard?.isModifierActive?.("Alt")), ignoreCost: false };
  }

  /** Caps vision (scene distance units) for conditions like blindness; null leaves it alone. */
  static visionLimitRule: ((token: Token) => number | null) | null = null;

  /** Vision radius in pixels; 0 means unlimited (bounded by walls only). */
  get sightRange(): number {
    const range = Number(this.document.sight?.range) || 0;
    return range > 0 ? range * currentCanvas().dimensions.distancePixels + Math.max(this.w, this.h) / 2 : 0;
  }

  /** Farthest this token sees at all, lights and global light included, in pixels. */
  get visionCap(): number {
    const limit = (this.constructor as typeof Token).visionLimitRule?.(this) ?? null;
    return limit === null ? Infinity : limit * currentCanvas().dimensions.distancePixels + Math.max(this.w, this.h) / 2;
  }

  protected override async _draw(): Promise<void> {
    const texture = await loadTexture(this.document.texture?.src ?? CONST.DEFAULT_TOKEN);
    if (this.destroyed) return;
    this.mesh = new PIXI.Sprite(texture ?? PIXI.Texture.WHITE);
    this.mesh.anchor.set(0.5);
    this.border = new PIXI.Graphics();
    this.bars = new PIXI.Graphics();
    this.nameplate = new PIXI.Text(this.document.name ?? "", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 22, fill: 0xffffff, stroke: 0x111111, strokeThickness: 4, align: "center" }));
    this.nameplate.anchor.set(0.5, 0);
    this.badges = new PIXI.Container();
    this.#badgeSignature = "";
    this.addChild(this.mesh, this.bars, this.border, this.badges, this.nameplate);
    this.position.set(this.document.x, this.document.y);
  }

  protected override _refresh(): void {
    if (!this.mesh || !this.nameplate) return;
    const { w, h } = this;
    if (!this.#animation) this.position.set(this.#livePosition?.x ?? this.document.x, this.#livePosition?.y ?? this.document.y);
    this.#refreshMesh(w, h);
    this.#refreshBorder(w, h);
    this.#refreshBars(w, h);
    this.#refreshBadges(w);
    this.nameplate.text = this.name;
    this.nameplate.position.set(w / 2, h + 4);
    this.nameplate.visible = this.hover || this.controlled || Number(this.document.displayName) >= CONST.TOKEN_DISPLAY_MODES.ALWAYS;
    this.#placeDragLabel(w, h);
    this.alpha = this.document.hidden ? 0.5 : (Number(this.document.alpha) ?? 1);
    this.hitArea = new PIXI.Rectangle(0, 0, w, h);
    this.cursor = this.canControl() || this.canDrag() ? "pointer" : "default";
  }

  #refreshMesh(width: number, height: number): void {
    const mesh = this.mesh as PIXI.Sprite;
    const texture = mesh.texture;
    const textureScale = Math.min(width / texture.width, height / texture.height);
    const scaleX = Number(this.document.texture?.scaleX ?? 1);
    const scaleY = Number(this.document.texture?.scaleY ?? 1);
    mesh.scale.set(textureScale * scaleX, textureScale * scaleY);
    mesh.position.set(width / 2, height / 2);
    mesh.angle = Number(this.document.rotation) || 0;
    mesh.tint = colorToNumber(this.document.texture?.tint, 0xffffff);
  }

  #refreshBorder(width: number, height: number): void {
    this.border.clear();
    if (!this.controlled && !this.hover) return;
    const color = this.controlled ? 0x3b82f6 : (DISPOSITION_COLORS[Number(this.document.disposition)] ?? 0xffffff);
    this.border.lineStyle(4, 0x000000, 0.6).drawRoundedRect(-1, -1, width + 2, height + 2, 6);
    this.border.lineStyle(2, color, 1).drawRoundedRect(-1, -1, width + 2, height + 2, 6);
  }

  #refreshBars(width: number, height: number): void {
    this.bars.clear();
    const displayMode = Number(this.document.displayBars);
    const shouldShow = displayMode >= CONST.TOKEN_DISPLAY_MODES.ALWAYS || (displayMode > 0 && (this.hover || this.controlled) && this.isOwner);
    if (!shouldShow) return;
    const barHeight = Math.max(6, height / 14);
    const bars: Array<["bar1" | "bar2", number, number]> = [["bar1", height - barHeight, 0x2ecc40], ["bar2", 0, 0x3a7bd5]];
    for (const [barName, barY, color] of bars) {
      const data = this.document.getBarAttribute?.(barName);
      if (!data || data.max <= 0) continue;
      const ratio = Math.min(Math.max(data.value / data.max, 0), 1);
      this.bars.beginFill(0x000000, 0.6).drawRect(0, barY, width, barHeight).endFill();
      this.bars.beginFill(color, 0.9).drawRect(1, barY + 1, (width - 2) * ratio, barHeight - 2).endFill();
    }
  }

  /** Draws the badges again, e.g. once the icon font they use finished loading. */
  redrawBadges(): void {
    this.#badgeSignature = "";
    this.refresh();
  }

  /** Rebuilt only when the badges change, since refresh runs on every hover and drag. */
  #refreshBadges(width: number): void {
    const badges = (this.constructor as typeof Token).badgesRule?.(this) ?? [];
    const signature = `${width}|${badges.map((badge) => `${badge.text}${badge.color}${badge.fontFamily ?? ""}`).join(",")}`;
    if (signature === this.#badgeSignature) return;
    this.#badgeSignature = signature;
    for (const child of this.badges.removeChildren()) child.destroy({ children: true });
    const radius = Math.max(9, Math.min(16, width / 8));
    badges.forEach((badge, index) => this.badges.addChild(this.#badge(badge, radius, radius + index * (radius * 2 + 2), radius)));
  }

  #badge(badge: TokenBadge, radius: number, x: number, y: number): PIXI.Container {
    const disc = new PIXI.Container();
    const background = new PIXI.Graphics();
    background.lineStyle(2, 0x111111, 0.8).beginFill(colorToNumber(badge.color, 0x666666), 0.95).drawCircle(0, 0, radius).endFill();
    const glyph = new PIXI.Text(badge.text, new PIXI.TextStyle({ fontFamily: badge.fontFamily ?? "Signika, Arial, sans-serif", fontWeight: (badge.fontWeight ?? "normal") as PIXI.TextStyleFontWeight, fontSize: Math.round(radius * 1.1), fill: 0xffffff }));
    glyph.anchor.set(0.5);
    disc.addChild(background, glyph);
    disc.position.set(x, y);
    return disc;
  }

  protected override redrawKeys(): string[] {
    return ["texture", "width", "height", "name"];
  }

  override _onUpdate(changed: PlainObject, options: PlainObject, userId: string): void {
    const moved = "x" in changed || "y" in changed;
    if (moved) this.#livePosition = null;
    if (moved && options.animate !== false) this.#animateTo({ x: this.document.x, y: this.document.y });
    super._onUpdate(changed, options, userId);
  }

  override get snapMode(): "corner" | "center" | "half" {
    return "corner";
  }

  /** Tokens are always placed freely, never fitted to the grid. */
  override getMoveUpdate(deltaX: number, deltaY: number, _snap: boolean): PlainObject {
    return super.getMoveUpdate(deltaX, deltaY, false);
  }

  override _onClickLeft2(): void {
    const actor = this.actor;
    if (actor?.testUserPermission?.(currentGame()?.user, "LIMITED")) actor.sheet?.render(true);
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showTokenMenu?.(this, event);
  }

  override _onDelete(options: PlainObject, userId: string): void {
    this.#stopAnimation();
    super._onDelete(options, userId);
  }

  /** Names the user dragging this token under its nameplate, for everyone at the table; `null` hides it. */
  showDragger(user: { name?: unknown; color?: unknown } | null): void {
    if (this.destroyed) return;
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    if (!name) {
      if (this.#dragLabel) this.#dragLabel.visible = false;
      return;
    }
    if (!this.#dragLabel || this.#dragLabel.destroyed) {
      this.#dragLabel = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 18, fontStyle: "italic", fill: 0xffffff, stroke: 0x111111, strokeThickness: 4, align: "center" }));
      this.#dragLabel.anchor.set(0.5, 0);
      this.addChild(this.#dragLabel);
    }
    this.#dragLabel.text = `${name} está movendo`;
    this.#dragLabel.style.fill = colorToNumber(user?.color, 0xffffff);
    this.#dragLabel.visible = true;
    this.#placeDragLabel(this.w, this.h);
  }

  #placeDragLabel(width: number, height: number): void {
    const label = this.#dragLabel;
    if (!label || label.destroyed || !label.visible) return;
    const below = this.nameplate?.visible ? this.nameplate.height + 2 : 0;
    label.position.set(width / 2, height + 4 + below);
  }

  /** Where another user is dragging this token right now; `null` returns it to its saved position. */
  showLivePosition(point: Point | null): void {
    if (this.destroyed) return;
    this.#livePosition = point;
    this.#animateTo(point ?? { x: this.document.x, y: this.document.y }, LIVE_DRAG_EASE_MS);
  }

  #animateTo(destination: Point, fixedDurationMs?: number): void {
    const from = { x: this.position.x, y: this.position.y };
    const distance = Math.hypot(destination.x - from.x, destination.y - from.y);
    if (distance < 1) return;
    this.#stopAnimation();
    const pixelsPerSecond = MOVE_SQUARES_PER_SECOND * (currentCanvas()?.grid?.size || 100);
    const duration = fixedDurationMs ?? Math.min((distance / pixelsPerSecond) * 1000, MAX_MOVE_DURATION_MS);
    this.#animation = { from, to: destination, startedAt: performance.now(), duration };
    currentCanvas()?.app?.ticker?.add(this.#animationTick);
  }

  #stepAnimation(): void {
    const animation = this.#animation;
    if (!animation || this.destroyed) return this.#stopAnimation();
    const progress = Math.min((performance.now() - animation.startedAt) / animation.duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    this.position.set(animation.from.x + (animation.to.x - animation.from.x) * eased, animation.from.y + (animation.to.y - animation.from.y) * eased);
    currentCanvas()?.perception?.update?.();
    if (progress >= 1) this.#stopAnimation();
  }

  #stopAnimation(): void {
    this.#animation = null;
    currentCanvas()?.app?.ticker?.remove(this.#animationTick);
  }
}
