import type { PlainObject } from "@tabbletop/common";

/** Minimal view of Roll that composite terms need; breaks the Roll <-> term import cycle. */
export interface RollLike {
  formula: string;
  total: number | undefined;
  terms: unknown[];
  dice: unknown[];
  _evaluated: boolean;
  evaluate(options?: object): Promise<RollLike>;
  evaluateSync(options?: object): RollLike;
  toJSON(): PlainObject;
}

export interface RollFactory {
  create(formula: string, data?: PlainObject, options?: PlainObject): RollLike;
  fromData(data: PlainObject): RollLike;
}

let registeredFactory: RollFactory | undefined;

export function registerRollFactory(factory: RollFactory): void {
  registeredFactory = factory;
}

export function rollFactory(): RollFactory {
  if (!registeredFactory) throw new Error("Roll implementation is not registered");
  return registeredFactory;
}
