import * as PIXI from "pixi.js";
import type { Point } from "../geometry";

const ICON_RADIUS = 17;
const SWING_DURATION_MS = 420;
const OPEN_SWING_RADIANS = (80 * Math.PI) / 180;
const LEAF_COLORS = { closed: 0xb7793a, open: 0x5fd35f, locked: 0xd64545 } as const;

export interface DoorAppearance {
  open: boolean;
  locked: boolean;
  keyed: boolean;
}

export interface DoorSegment {
  hinge: Point;
  latch: Point;
}

/**
 * Door visuals shared by every user: a clickable badge at the middle of the doorway and the door leaf
 * swinging around its hinge on the map. `progress` goes from 0 (shut) to 1 (fully open).
 */
export class DoorControl extends PIXI.Container {
  readonly leaf = new PIXI.Graphics();
  readonly #badge = new PIXI.Container();
  readonly #badgeBackground = new PIXI.Graphics();
  readonly #badgeLeaf = new PIXI.Graphics();
  readonly #badgeMarks = new PIXI.Graphics();
  #progress = 0;
  #swing: { from: number; to: number; startedAt: number } | null = null;
  #appearance: DoorAppearance = { open: false, locked: false, keyed: false };
  #segment: DoorSegment = { hinge: { x: 0, y: 0 }, latch: { x: 0, y: 0 } };
  readonly #tick = () => this.#stepSwing();

  constructor(private readonly ticker: PIXI.Ticker | null, onActivate: (event: PIXI.FederatedPointerEvent) => void) {
    super();
    this.#badge.addChild(this.#badgeBackground, this.#badgeLeaf, this.#badgeMarks);
    this.#badge.eventMode = "static";
    this.#badge.cursor = "pointer";
    this.#badge.hitArea = new PIXI.Circle(0, 0, ICON_RADIUS + 4);
    this.#badge.on("pointerdown", (event: PIXI.FederatedPointerEvent) => {
      event.stopPropagation();
      onActivate(event);
    });
    this.leaf.eventMode = "none";
    this.addChild(this.leaf, this.#badge);
  }

  /** Applies the latest door state; a change of open/closed swings the leaf instead of snapping. */
  update(segment: DoorSegment, appearance: DoorAppearance, animate: boolean): void {
    const wasOpen = this.#appearance.open;
    this.#segment = segment;
    this.#appearance = appearance;
    const target = appearance.open ? 1 : 0;
    if (animate && wasOpen !== appearance.open && this.ticker) this.#startSwing(target);
    else if (!this.#swing) this.#progress = target;
    this.#badge.position.set((segment.hinge.x + segment.latch.x) / 2, (segment.hinge.y + segment.latch.y) / 2);
    this.#draw();
  }

  override destroy(options?: boolean | PIXI.IDestroyOptions): void {
    this.ticker?.remove(this.#tick);
    super.destroy(options);
  }

  #startSwing(target: number): void {
    this.#swing = { from: this.#progress, to: target, startedAt: performance.now() };
    this.ticker?.remove(this.#tick);
    this.ticker?.add(this.#tick);
  }

  #stepSwing(): void {
    const swing = this.#swing;
    if (!swing || this.destroyed) {
      this.ticker?.remove(this.#tick);
      return;
    }
    const elapsed = Math.min((performance.now() - swing.startedAt) / SWING_DURATION_MS, 1);
    const eased = 1 - (1 - elapsed) ** 3;
    this.#progress = swing.from + (swing.to - swing.from) * eased;
    this.#draw();
    if (elapsed >= 1) {
      this.#swing = null;
      this.ticker?.remove(this.#tick);
    }
  }

  #leafColor(): number {
    if (this.#appearance.locked) return LEAF_COLORS.locked;
    return this.#appearance.open ? LEAF_COLORS.open : LEAF_COLORS.closed;
  }

  #draw(): void {
    this.#drawMapLeaf();
    this.#drawBadge();
  }

  #drawMapLeaf(): void {
    const { hinge, latch } = this.#segment;
    const length = Math.hypot(latch.x - hinge.x, latch.y - hinge.y);
    const angle = Math.atan2(latch.y - hinge.y, latch.x - hinge.x) - this.#progress * OPEN_SWING_RADIANS;
    const tip = { x: hinge.x + Math.cos(angle) * length, y: hinge.y + Math.sin(angle) * length };
    const leaf = this.leaf.clear();
    if (this.#progress > 0.02) leaf.lineStyle(2, 0x000000, 0.35).moveTo(hinge.x, hinge.y).lineTo(latch.x, latch.y);
    leaf.lineStyle(10, 0x000000, 0.55).moveTo(hinge.x, hinge.y).lineTo(tip.x, tip.y);
    leaf.lineStyle(6, this.#leafColor(), 1).moveTo(hinge.x, hinge.y).lineTo(tip.x, tip.y);
    leaf.lineStyle(0).beginFill(0x2b2b2b, 1).drawCircle(hinge.x, hinge.y, 5).endFill();
  }

  /** Front view of the door: the leaf narrows toward its hinge as it swings, revealing the dark doorway. */
  #drawBadge(): void {
    this.#badgeBackground.clear().lineStyle(2, 0x000000, 0.8).beginFill(0x1d2433, 0.92).drawCircle(0, 0, ICON_RADIUS).endFill();
    this.#badgeBackground.lineStyle(0).beginFill(0x05070a, 1).drawRect(-8, -11, 16, 22).endFill();
    const visibleWidth = 16 * Math.max(Math.cos(this.#progress * OPEN_SWING_RADIANS), 0.18);
    this.#badgeLeaf.clear().beginFill(this.#leafColor(), 1).drawRect(-8, -11, visibleWidth, 22).endFill();
    this.#badgeLeaf.beginFill(0x1d1206, 0.9).drawCircle(-8 + visibleWidth - 3, 1, 1.6).endFill();
    this.#badgeMarks.clear();
    if (this.#appearance.locked) this.#badgeMarks.lineStyle(2, 0xffffff, 1).drawRect(-4, -1, 8, 7).moveTo(-2.5, -1).arc(0, -1, 2.5, Math.PI, 0);
    if (this.#appearance.keyed) this.#badgeMarks.lineStyle(0).beginFill(0xffd84d, 1).drawCircle(ICON_RADIUS - 4, -ICON_RADIUS + 4, 5).endFill();
  }
}
