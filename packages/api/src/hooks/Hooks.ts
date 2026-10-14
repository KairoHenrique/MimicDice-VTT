import { currentConfig, currentUi } from "../runtime";

type HookCallback = (...args: any[]) => unknown;

interface HookedFunction {
  hook: string;
  id: number;
  fn: HookCallback;
  once: boolean;
}

interface HookErrorOptions {
  msg?: string;
  notify?: "info" | "warn" | "error" | null;
  log?: "log" | "info" | "warn" | "error" | null;
  [data: string]: unknown;
}

const LOG_PREFIX = "MimicDice |";

export class Hooks {
  static #events: Record<string, HookedFunction[]> = {};
  static #functionsById = new Map<number, HookedFunction>();
  static #nextId = 1;

  static get events(): Readonly<Record<string, HookedFunction[]>> {
    return Hooks.#events;
  }

  static on(hook: string, fn: HookCallback, { once = false }: { once?: boolean } = {}): number {
    if (typeof fn !== "function") throw new Error(`Hooks.on requires a function for hook "${hook}"`);
    if (currentConfig().debug?.hooks) console.debug(`${LOG_PREFIX} Registered callback for ${hook} hook`);
    const hookedFunction: HookedFunction = { hook, id: Hooks.#nextId++, fn, once };
    (Hooks.#events[hook] ??= []).push(hookedFunction);
    Hooks.#functionsById.set(hookedFunction.id, hookedFunction);
    return hookedFunction.id;
  }

  static once(hook: string, fn: HookCallback): number {
    return Hooks.on(hook, fn, { once: true });
  }

  static off(hook: string, fnOrId: HookCallback | number): void {
    const registered = Hooks.#events[hook];
    if (!registered) return;
    const index =
      typeof fnOrId === "number" ? registered.findIndex((entry) => entry.id === fnOrId) : registered.findIndex((entry) => entry.fn === fnOrId);
    if (index === -1) return;
    const [removed] = registered.splice(index, 1);
    Hooks.#functionsById.delete(removed.id);
    if (registered.length === 0) delete Hooks.#events[hook];
  }

  static callAll(hook: string, ...args: unknown[]): true {
    if (currentConfig().debug?.hooks) console.debug(`${LOG_PREFIX} Calling ${hook} hook with args:`, args);
    const registered = Hooks.#events[hook];
    if (!registered) return true;
    for (const hookedFunction of Array.from(registered)) Hooks.#invoke(hookedFunction, args);
    return true;
  }

  static call(hook: string, ...args: unknown[]): boolean {
    if (currentConfig().debug?.hooks) console.debug(`${LOG_PREFIX} Calling ${hook} hook with args:`, args);
    const registered = Hooks.#events[hook];
    if (!registered) return true;
    for (const hookedFunction of Array.from(registered)) {
      if (Hooks.#invoke(hookedFunction, args) === false) return false;
    }
    return true;
  }

  static onError(location: string, error: unknown, { msg = "", notify = null, log = null, ...data }: HookErrorOptions = {}): void {
    if (!(error instanceof Error)) return;
    if (msg) error.message = `${msg}. ${error.message}`;
    if (log) console[log]?.(error);
    if (notify) currentUi()?.notifications?.[notify]?.(msg || error.message);
    Hooks.callAll("error", location, error, data);
  }

  static #invoke(hookedFunction: HookedFunction, args: unknown[]): unknown {
    if (hookedFunction.once) Hooks.off(hookedFunction.hook, hookedFunction.id);
    try {
      return hookedFunction.fn(...args);
    } catch (error) {
      const message = `Error thrown in hooked function '${hookedFunction.fn?.name ?? "anonymous"}' for hook '${hookedFunction.hook}'`;
      console.warn(`${LOG_PREFIX} ${message}`);
      if (hookedFunction.hook !== "error") Hooks.onError("Hooks.#call", error, { msg: message, hook: hookedFunction.hook, fn: hookedFunction.fn, log: "error" });
      return undefined;
    }
  }
}
