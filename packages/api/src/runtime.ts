/* Typed access to the globals add-ons read and replace at runtime (game, ui, CONFIG). */

export interface UiNamespace {
  notifications?: {
    info(message: string, options?: object): unknown;
    warn(message: string, options?: object): unknown;
    error(message: string, options?: object): unknown;
    notify(message: string, type?: string, options?: object): unknown;
  };
  windows: Record<number, unknown>;
  [applicationName: string]: any;
}

interface FoundryGlobalScope {
  game?: any;
  ui?: UiNamespace;
  CONFIG?: any;
  [name: string]: any;
}

export const globalScope = globalThis as unknown as FoundryGlobalScope;

export function currentGame(): any {
  return globalScope.game;
}

export function currentUi(): UiNamespace | undefined {
  return globalScope.ui;
}

export function currentCanvas(): any {
  return globalScope.canvas;
}

export function currentConfig(): any {
  return globalScope.CONFIG ?? { debug: {} };
}

export function localize(key: string): string {
  return globalScope.game?.i18n?.localize?.(key) ?? key;
}

export function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: false });
}
