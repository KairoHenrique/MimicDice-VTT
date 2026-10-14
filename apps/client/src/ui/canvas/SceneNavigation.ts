import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";

/** Top bar of scenes. The GM views a scene with a click and pulls everyone to it with "Ativar"; players see the active one. */
export class SceneNavigation extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "navigation",
    tag: "nav",
    classes: ["scene-navigation"],
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  constructor() {
    super();
    game.scenes.apps.push(this);
    for (const hook of ["canvasReady", "updateScene", "createScene", "deleteScene"]) Hooks.on(hook, () => void this.render());
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const scenes = game.scenes.contents
      .filter((scene: any) => scene.active || (game.user.isGM && scene._source.navigation !== false) || scene.isView)
      .sort((left: any, right: any) => (left._source.navOrder ?? 0) - (right._source.navOrder ?? 0) || String(left.name).localeCompare(String(right.name), "pt-BR"));
    return { scenes };
  }

  buildContent(context: Record<string, unknown>): Node[] {
    const scenes = context.scenes as any[];
    if (scenes.length === 0) {
      const hint = game.user.isGM ? "Nenhuma cena. Crie uma na aba Cenas." : "O mestre ainda não ativou uma cena.";
      return [h("p", { class: "scene-nav-empty" }, hint)];
    }
    return [h("ol", { class: "scene-list" }, ...scenes.map((scene) => this.#buildSceneButton(scene)))];
  }

  #buildSceneButton(scene: any): HTMLElement {
    const classes = ["scene", scene.active ? "active" : "", scene.isView ? "view" : ""].filter(Boolean).join(" ");
    const label = scene._source.navName || scene.name;
    const item = h("li", { class: classes, "data-scene-id": scene.id });
    const viewButton = h("button", { type: "button", class: "scene-name", title: game.user.isGM ? "Ver esta cena (só você)" : label }, scene.active ? h("i", { class: "fa-solid fa-bullseye" }) : null, ` ${label}`);
    viewButton.addEventListener("click", () => void scene.view());
    item.append(viewButton);
    if (game.user.isGM && !scene.active) {
      const activateButton = h("button", { type: "button", class: "scene-activate icon", title: "Ativar para todos", "aria-label": "Ativar para todos" }, h("i", { class: "fa-solid fa-play" }));
      activateButton.addEventListener("click", () => void scene.activate());
      item.append(activateButton);
    }
    return item;
  }
}
