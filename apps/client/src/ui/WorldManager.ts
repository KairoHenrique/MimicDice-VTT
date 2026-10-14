import type { ApplicationConfiguration } from "@tabbletop/api";
import type { WorldSummaryRecord } from "@tabbletop/protocol";
import { getJson, sendJson } from "../net/apiClient";
import { formErrorSlot, h } from "../views/dom";
import { DomApplication } from "./DomApplication";

const SWITCH_WARNING = "Todos que estão na mesa serão recarregados. Jogadores que não existem na outra sala voltam para a tela de entrada.";

/** Game Master's list of tables (one per campaign); the server remembers the last one opened. */
export class WorldManager extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "world-manager",
    classes: ["world-manager"],
    window: { title: "Salas (RPGs)", frame: true, positioned: true, icon: "fa-solid fa-door-open", controls: [], minimizable: true, resizable: false, contentTag: "section", contentClasses: [] },
    position: { width: 460 },
  };

  #busy = false;

  override async _prepareContext(): Promise<Record<string, unknown>> {
    return { worlds: await getJson<WorldSummaryRecord[]>("/api/worlds") };
  }

  buildContent(context: Record<string, unknown>): Node[] {
    const worlds = context.worlds as WorldSummaryRecord[];
    const rows = worlds.map((world) => this.#worldRow(world));
    return [
      h("p", { class: "hint" }, "Cada sala é uma campanha separada, com cenas, fichas e jogadores próprios. A sala aberta fica salva para a próxima vez que você ligar o MimicDice."),
      h("ul", { class: "world-list" }, ...rows),
      this.#createForm(),
    ];
  }

  #worldRow(world: WorldSummaryRecord): HTMLElement {
    const created = new Date(world.created);
    const meta = Number.isNaN(created.getTime()) ? "" : `Criada em ${created.toLocaleDateString("pt-BR")}`;
    const action = world.active
      ? h("span", { class: "world-active" }, h("i", { class: "fa-solid fa-circle-check" }), " Aberta")
      : h("button", { type: "button", class: "world-open" }, h("i", { class: "fa-solid fa-door-open" }), " Abrir");
    if (!world.active) action.addEventListener("click", () => void this.#open(world));
    return h("li", { class: `world-row${world.active ? " active" : ""}` }, h("span", { class: "world-name" }, h("strong", {}, world.title), h("span", { class: "hint" }, meta)), action);
  }

  #createForm(): HTMLElement {
    const errorSlot = formErrorSlot();
    const title = h("input", { type: "text", placeholder: "Nome da nova sala (ex.: Mesa de Terror)", required: true, maxlength: 80 });
    const create = h("button", { type: "button", class: "primary" }, h("i", { class: "fa-solid fa-plus" }), " Criar e abrir");
    create.addEventListener("click", async () => {
      errorSlot.clear();
      if (!title.reportValidity() || !(await this.#confirm(`Criar e abrir "${title.value.trim()}"?`))) return;
      await this.#run(() => sendJson("POST", "/api/worlds", { title: title.value }), errorSlot.show);
    });
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        create.click();
      }
    });
    return h("div", { class: "world-create" }, h("h3", {}, "Nova sala"), h("div", { class: "world-create-row" }, title, create), errorSlot.element);
  }

  async #open(world: WorldSummaryRecord): Promise<void> {
    if (!(await this.#confirm(`Abrir a sala "${world.title}"?`))) return;
    await this.#run(() => sendJson("POST", "/api/worlds/activate", { worldId: world.id }), (message) => ui.notifications.error(message));
  }

  #confirm(question: string): Promise<boolean> {
    const content = `<p>${foundry.utils.escapeHTML(question)}</p><p class="hint">${SWITCH_WARNING}</p>`;
    return foundry.applications.api.DialogV2.confirm({ window: { title: "Trocar de sala" }, content }).then((answer: unknown) => answer === true);
  }

  async #run(request: () => Promise<unknown>, onError: (message: string) => void): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      await request();
      ui.notifications.info("Abrindo a sala...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível trocar de sala.");
      this.#busy = false;
    }
  }
}
