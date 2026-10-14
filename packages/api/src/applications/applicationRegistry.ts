export const applicationInstances = new Map<string, any>();

let maxZIndex = 100;

export function nextZIndex(): number {
  maxZIndex += 1;
  return maxZIndex;
}

export function* inheritanceChainOf(constructor: Function, base: Function): Generator<Function> {
  let current: Function | null = constructor;
  while (current) {
    yield current;
    if (current === base) return;
    current = Object.getPrototypeOf(current);
  }
}
