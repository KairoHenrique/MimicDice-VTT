import * as PIXI from "pixi.js";
import { currentCanvas } from "../runtime";

export interface CanvasAnimationAttribute {
  parent: Record<string, any>;
  attribute: string;
  to: number;
  from?: number;
  delta?: number;
}

export interface CanvasAnimationOptions {
  name?: string | symbol;
  duration?: number;
  easing?: string | ((progress: number) => number);
  context?: PIXI.DisplayObject;
  ontick?: (elapsed: number, animation: RunningAnimation) => void;
  priority?: number;
}

interface RunningAnimation {
  attributes: CanvasAnimationAttribute[];
  duration: number;
  time: number;
  promise: Promise<boolean>;
  resolve: (completed: boolean) => void;
  tick: () => void;
  ticker?: PIXI.Ticker;
  context?: PIXI.DisplayObject;
}

const EASINGS: Record<string, (progress: number) => number> = {
  easeInOutCosine: (progress) => (1 - Math.cos(Math.PI * progress)) / 2,
  easeInCircle: (progress) => 1 - Math.sqrt(1 - progress * progress),
  easeOutCircle: (progress) => Math.sqrt(1 - (progress - 1) * (progress - 1)),
  linear: (progress) => progress,
};

/** Property tweens driven by the board ticker. Starting an animation with an existing name replaces the old one. */
export class CanvasAnimation {
  static readonly animations: Record<string | symbol, RunningAnimation> = {};

  static get ticker(): PIXI.Ticker {
    return currentCanvas()?.app?.ticker ?? PIXI.Ticker.shared;
  }

  static easeInOutCosine = EASINGS.easeInOutCosine;
  static easeInCircle = EASINGS.easeInCircle;
  static easeOutCircle = EASINGS.easeOutCircle;

  static animate(attributes: CanvasAnimationAttribute[], { name = Symbol("CanvasAnimation"), duration = 1000, easing, context, ontick, priority = PIXI.UPDATE_PRIORITY.LOW + 1 }: CanvasAnimationOptions = {}): Promise<boolean> {
    this.terminateAnimation(name);
    const easingFunction = typeof easing === "function" ? easing : easing ? EASINGS[easing] ?? EASINGS.linear : EASINGS.linear;
    const prepared = attributes.map((attribute) => {
      const from = attribute.from ?? Number(attribute.parent[attribute.attribute]);
      return { ...attribute, from, delta: attribute.to - from };
    });
    let resolve: (completed: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((done) => (resolve = done));
    const animation: RunningAnimation = { attributes: prepared, duration: Math.max(duration, 0), time: 0, promise, resolve, context, tick: () => undefined };
    const ticker = this.ticker;
    animation.tick = () => {
      if (context?.destroyed) return this.#finish(name, animation, false);
      animation.time += ticker.deltaMS;
      const progress = animation.duration === 0 ? 1 : Math.min(animation.time / animation.duration, 1);
      const eased = easingFunction(progress);
      for (const attribute of prepared) attribute.parent[attribute.attribute] = (attribute.from as number) + (attribute.delta as number) * eased;
      ontick?.(ticker.deltaMS, animation);
      if (progress >= 1) this.#finish(name, animation, true);
    };
    this.animations[name] = animation;
    animation.ticker = ticker;
    ticker.add(animation.tick, undefined, priority);
    return promise;
  }

  static #finish(name: string | symbol, animation: RunningAnimation, completed: boolean): void {
    animation.ticker?.remove(animation.tick);
    if (this.animations[name] === animation) delete this.animations[name];
    animation.resolve(completed);
  }

  static getAnimation(name: string | symbol): RunningAnimation | undefined {
    return this.animations[name];
  }

  static terminateAnimation(name: string | symbol): void {
    const animation = this.animations[name];
    if (animation) this.#finish(name, animation, false);
  }
}
