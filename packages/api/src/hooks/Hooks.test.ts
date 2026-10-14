import { describe, expect, it, vi } from "vitest";
import { Hooks } from "./Hooks";

describe("Hooks", () => {
  it("calls every listener with callAll", () => {
    const first = vi.fn();
    const second = vi.fn();
    Hooks.on("testCallAll", first);
    Hooks.on("testCallAll", second);
    expect(Hooks.callAll("testCallAll", 1, 2)).toBe(true);
    expect(first).toHaveBeenCalledWith(1, 2);
    expect(second).toHaveBeenCalledWith(1, 2);
  });

  it("stops call() when a listener returns false", () => {
    const blocked = vi.fn();
    Hooks.on("testCall", () => false);
    Hooks.on("testCall", blocked);
    expect(Hooks.call("testCall")).toBe(false);
    expect(blocked).not.toHaveBeenCalled();
  });

  it("runs once() listeners a single time", () => {
    const listener = vi.fn();
    Hooks.once("testOnce", listener);
    Hooks.callAll("testOnce");
    Hooks.callAll("testOnce");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("removes listeners by id or function", () => {
    const byId = vi.fn();
    const byFunction = vi.fn();
    const id = Hooks.on("testOff", byId);
    Hooks.on("testOff", byFunction);
    Hooks.off("testOff", id);
    Hooks.off("testOff", byFunction);
    Hooks.callAll("testOff");
    expect(byId).not.toHaveBeenCalled();
    expect(byFunction).not.toHaveBeenCalled();
  });

  it("keeps calling other listeners when one throws", () => {
    const survivor = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Hooks.on("testThrow", () => {
      throw new Error("boom");
    });
    Hooks.on("testThrow", survivor);
    Hooks.callAll("testThrow");
    expect(survivor).toHaveBeenCalled();
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});
