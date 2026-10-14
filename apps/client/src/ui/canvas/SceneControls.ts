import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { buildDefaultSceneControls, type SceneControl, type SceneControlTool } from "./defaultSceneControls";

const byOrder = <T extends { order: number }>(left: T, right: T) => left.order - right.order;

/** Left-hand toolbar choosing the active canvas layer and tool; packages extend it via `getSceneControlButtons`. */
export class SceneControls extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "scene-controls",
    tag: "nav",
    classes: ["scene-controls"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  controls: Record<string, SceneControl> = {};
  #activeControl = "tokens";
  #activeTools: Record<string, string> = {};

  get control(): SceneControl | null {
    return this.controls[this.#activeControl] ?? null;
  }

  get tool(): SceneControlTool | null {
    const control = this.control;
    if (!control) return null;
    return control.tools[this.#activeTools[control.name] ?? control.activeTool] ?? null;
  }

  get activeControl(): string {
    return this.#activeControl;
  }

  get activeTool(): string | null {
    return this.tool?.name ?? null;
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const controls = buildDefaultSceneControls();
    for (const [name, toolName] of Object.entries(this.#activeTools)) if (controls[name]?.tools[toolName]) controls[name].activeTool = toolName;
    Hooks.callAll("getSceneControlButtons", controls);
    this.controls = controls;
    if (!this.control || this.control.visible === false) this.#activeControl = "tokens";
    return { controls };
  }

  /** Switches layer and/or tool, as `ui.controls.activate({ control, tool })` does in v13. */
  async activate({ control, tool, event }: { control?: string; tool?: string; event?: Event } = {}): Promise<void> {
    const syntheticEvent = event ?? new Event("click");
    if (control && control !== this.#activeControl && this.controls[control]) {
      this.control?.onChange?.(syntheticEvent, false);
      this.#activeControl = control;
      this.control?.onChange?.(syntheticEvent, true);
    }
    const activeControl = this.control;
    if (!activeControl) return;
    if (tool && activeControl.tools[tool]) {
      this.#activeTools[activeControl.name] = tool;
      activeControl.activeTool = tool;
      activeControl.onToolChange?.(syntheticEvent, activeControl.tools[tool]);
    }
    const layer = activeControl.layer ? canvas?.[activeControl.layer] : null;
    if (canvas?.ready && layer?.activate) layer.activate({ tool: this.activeTool ?? undefined });
    await this.render();
  }

  buildContent(context: Record<string, unknown>): Node[] {
    const controls = Object.values(context.controls as Record<string, SceneControl>).filter((control) => control.visible !== false).sort(byOrder);
    const layerList = h("menu", { class: "control-layers" });
    for (const control of controls) {
      const title = game.i18n.localize(control.title ?? "");
      const button = h("button", { type: "button", class: `control ui-control${control.name === this.#activeControl ? " active" : ""}`, "data-control": control.name, title, "aria-label": title }, h("i", { class: control.icon }));
      button.addEventListener("click", (event) => void this.activate({ control: control.name, event }));
      layerList.append(h("li", {}, button));
    }
    const toolList = h("menu", { class: "control-tools" });
    for (const tool of Object.values(this.control?.tools ?? {}).filter((entry) => entry.visible !== false).sort(byOrder)) {
      toolList.append(h("li", {}, this.#buildToolButton(tool)));
    }
    return [layerList, toolList];
  }

  #buildToolButton(tool: SceneControlTool): HTMLButtonElement {
    const isActive = tool.toggle ? tool.active === true : !tool.button && tool.name === this.activeTool;
    const title = game.i18n.localize(tool.title ?? "");
    const icon = h("i", { class: tool.icon });
    if (tool.iconColor) icon.style.color = tool.iconColor;
    const button = h("button", { type: "button", class: `tool ui-control${isActive ? " active" : ""}${tool.toggle ? " toggle" : ""}`, "data-tool": tool.name, title, "aria-label": title, "aria-pressed": String(isActive) }, icon);
    button.addEventListener("click", (event) => {
      if (tool.button) {
        void tool.onChange?.(event, true);
        return;
      }
      if (tool.toggle) {
        tool.active = !tool.active;
        void tool.onChange?.(event, tool.active);
        void this.render();
        return;
      }
      void this.activate({ tool: tool.name, event });
    });
    return button;
  }
}
