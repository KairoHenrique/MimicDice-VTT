import { describe, expect, it, vi } from "vitest";
import { Keybindings, sanitizeBindings } from "./Keybindings";

function createBindings(): Keybindings {
  const keybindings = new Keybindings();
  keybindings.register("core", "centerOwnToken", { name: "Centralizar", editable: [{ key: "Space" }] });
  return keybindings;
}

describe("Keybindings", () => {
  it("stores only customised actions and persists them", async () => {
    const keybindings = createBindings();
    const persist = vi.fn();
    keybindings.persist = persist;
    await keybindings.set("core", "centerOwnToken", [{ key: "KeyC", modifiers: ["Shift"] }]);
    expect(keybindings.get("core", "centerOwnToken")).toEqual([{ key: "KeyC", modifiers: ["Shift"] }]);
    expect(persist).toHaveBeenLastCalledWith({ "core.centerOwnToken": [{ key: "KeyC", modifiers: ["Shift"] }] });
    await keybindings.reset("core", "centerOwnToken");
    expect(keybindings.get("core", "centerOwnToken")).toEqual([{ key: "Space", modifiers: [] }]);
    expect(persist).toHaveBeenLastCalledWith({});
  });

  it("applies stored overrides to actions registered later", () => {
    const keybindings = new Keybindings();
    keybindings.loadOverrides({ "pkg.action": [{ key: "KeyQ" }] });
    keybindings.register("pkg", "action", { name: "Ação", editable: [{ key: "KeyE" }] });
    expect(keybindings.get("pkg", "action")).toEqual([{ key: "KeyQ", modifiers: [] }]);
    expect(keybindings.defaultsFor("pkg.action")).toEqual([{ key: "KeyE", modifiers: [] }]);
  });

  it("drops malformed stored bindings", () => {
    expect(sanitizeBindings([{ key: "<script>" }, { key: "KeyA", modifiers: ["Control", "Hyper", 3] }, null, "x"])).toEqual([{ key: "KeyA", modifiers: ["Control"] }]);
    expect(sanitizeBindings("nope")).toEqual([]);
  });
});
