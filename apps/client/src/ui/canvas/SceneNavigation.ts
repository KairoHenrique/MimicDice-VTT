import type { ApplicationConfiguration, RenderOptions } from "@tabbletop/api";
import { DomApplication } from "../DomApplication";

/**
 * Scenes are switched from the Cenas sidebar tab, so the top scene bar is not shown.
 * `ui.nav` still exists because packages call its methods (render, collapse, expand).
 */
export class SceneNavigation extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "navigation",
    tag: "nav",
    classes: ["scene-navigation"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  collapsed = true;

  buildContent(): Node[] {
    return [];
  }

  override async _onRender(context: object, options: RenderOptions): Promise<void> {
    await super._onRender(context, options);
    this.element?.setAttribute("hidden", "");
  }

  collapse(): void {}

  expand(): void {}
}
