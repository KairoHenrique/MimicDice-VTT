import * as PIXI from "pixi.js";
import type { Point } from "../geometry";

const PING_DURATION_MS = 3000;
const RING_COUNT = 3;
const MAX_ACTIVE_PINGS = 12;

export interface PingOptions {
  color: number;
  label?: string;
  /** World-space radius of the outer ring; defaults to two grid squares. */
  size: number;
}

/**
 * Expanding rings plus a name tag at a world point. Each ping removes itself when it ends,
 * and older pings are dropped first so spamming cannot pile up graphics.
 */
export class PingEffects {
  readonly #active = new Set<PIXI.Container>();

  constructor(
    private readonly parent: PIXI.Container,
    private readonly ticker: PIXI.Ticker,
  ) {}

  play(origin: Point, options: PingOptions): Promise<void> {
    if (this.#active.size >= MAX_ACTIVE_PINGS) this.#destroy(this.#active.values().next().value as PIXI.Container);
    const container = new PIXI.Container();
    container.position.set(origin.x, origin.y);
    container.zIndex = 1000;
    const rings = new PIXI.Graphics();
    container.addChild(rings);
    if (options.label) container.addChild(this.#label(options.label, options.size));
    this.parent.addChild(container);
    this.#active.add(container);
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const progress = Math.min((performance.now() - startedAt) / PING_DURATION_MS, 1);
        if (container.destroyed || progress >= 1) {
          this.ticker.remove(step);
          this.#destroy(container);
          resolve();
          return;
        }
        this.#drawRings(rings, progress, options);
        container.alpha = progress > 0.75 ? 1 - (progress - 0.75) / 0.25 : 1;
      };
      this.ticker.add(step);
    });
  }

  clear(): void {
    for (const container of [...this.#active]) this.#destroy(container);
  }

  #drawRings(rings: PIXI.Graphics, progress: number, options: PingOptions): void {
    rings.clear();
    rings.beginFill(options.color, 0.9).lineStyle(3, 0x000000, 0.6).drawCircle(0, 0, options.size * 0.12).endFill();
    for (let index = 0; index < RING_COUNT; index += 1) {
      const phase = (progress * 2 + index / RING_COUNT) % 1;
      const radius = options.size * (0.15 + phase * 0.85);
      rings.lineStyle(Math.max(options.size * 0.05, 3), options.color, 1 - phase);
      rings.drawCircle(0, 0, radius);
    }
  }

  #label(text: string, size: number): PIXI.Text {
    const label = new PIXI.Text(text, new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: Math.max(size * 0.22, 18), fill: 0xffffff, stroke: 0x111111, strokeThickness: 5 }));
    label.anchor.set(0.5, 0);
    label.position.set(0, size * 0.2);
    return label;
  }

  #destroy(container: PIXI.Container): void {
    this.#active.delete(container);
    if (!container.destroyed) container.destroy({ children: true });
  }
}
