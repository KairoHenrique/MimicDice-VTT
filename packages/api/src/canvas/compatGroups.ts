import * as PIXI from "pixi.js";
import { CanvasAnimation } from "./animation";
import { PreciseText } from "./containers";
import type { Point } from "./geometry";
import { CanvasLayer } from "./layers/CanvasLayer";

/**
 * Canvas groups and layers that Tabbletop does not render separately yet. They exist so packages can subclass
 * them or wrap their prototype methods; the default implementations are inert.
 */
export class EffectsCanvasGroup extends PIXI.Container {
  async animateDarkness(_target = 1.0, { duration = 10000 }: { duration?: number } = {}): Promise<void> {
    void duration;
  }
}

export class ControlsLayer extends CanvasLayer {
  static override layerOptions = { name: "controls", zIndex: 1000 };

  protected override async _draw(): Promise<void> {}

  drawCursor(_user: unknown, _position: unknown): void {}

  async handlePing(_user: unknown, _position: unknown, _options: Record<string, unknown> = {}): Promise<boolean> {
    return false;
  }
}

export class PrimaryCanvasGroup extends PIXI.Container {}

const SCROLL_DIRECTIONS: Record<number, Point> = { 0: { x: 0, y: 0 }, 1: { x: 0, y: -1 }, 2: { x: 0, y: 1 }, 3: { x: -1, y: 0 }, 4: { x: 1, y: 0 } };
const MAX_SCROLLING_TEXT_LENGTH = 200;

interface ScrollingTextOptions {
  direction?: number;
  distance?: number;
  duration?: number;
  fontSize?: number;
  fill?: string | number;
  stroke?: string | number;
  strokeThickness?: number;
  jitter?: number;
}

/** Container above every layer, used for transient labels such as damage numbers. */
export class InterfaceCanvasGroup extends PIXI.Container {
  grid: unknown = null;

  async createScrollingText(origin: Point, content: unknown, { direction = 1, distance, duration = 2000, fontSize = 28, fill = "#ffffff", stroke = "#000000", strokeThickness = 4, jitter = 0 }: ScrollingTextOptions = {}): Promise<void> {
    const text = String(content ?? "").slice(0, MAX_SCROLLING_TEXT_LENGTH);
    if (!text) return;
    const label = new PreciseText(text, PreciseText.getTextStyle({ fontSize, fill, stroke, strokeThickness }));
    label.anchor.set(0.5);
    const offset = jitter > 0 ? (Math.random() - 0.5) * jitter * fontSize : 0;
    label.position.set(origin.x + offset, origin.y + offset);
    this.addChild(label);
    const vector = SCROLL_DIRECTIONS[direction] ?? SCROLL_DIRECTIONS[1];
    const travel = distance ?? fontSize * 3;
    await CanvasAnimation.animate(
      [
        { parent: label.position, attribute: "x", to: label.position.x + vector.x * travel },
        { parent: label.position, attribute: "y", to: label.position.y + vector.y * travel },
        { parent: label, attribute: "alpha", to: 0 },
      ],
      { duration, context: label },
    );
    if (!label.destroyed) label.destroy();
  }
}
