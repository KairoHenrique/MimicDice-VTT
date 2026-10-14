import { DialogV2, type ApplicationConfiguration } from "@tabbletop/api";
import { MAX_ACTOR_CATEGORIES, type ActorCategory } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { CATEGORY_COLORS, createActorCategory, deleteActorCategory, readActorCategories, setActorMembership, updateActorCategory } from "./actorCategoryStore";

function reportFailure(error: unknown): void {
  ui.notifications.warn(error instanceof Error ? error.message : "Não foi possível salvar.");
}

/** GM-only window to name, color and remove his private actor categories ("Elfos", "Reino do Norte"...). */
export class ActorCategoryManager extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "actor-category-manager",
    classes: ["md-category-manager"],
    tag: "section",
    window: { title: "Categorias de atores", frame: true, positioned: true, icon: "fa-solid fa-tags", controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
    position: { width: 440 },
  };

  buildContent(): Node[] {
    const categories = readActorCategories();
    const list = h("ul", { class: "md-category-list" }, ...categories.map((category) => this.#row(category)));
    if (categories.length === 0) list.append(h("li", { class: "hint" }, "Nenhuma categoria. Crie uma abaixo, por exemplo \"Elfos\" ou \"Floresta Sombria\"."));
    return [
      h("p", { class: "hint" }, "Só você vê estas categorias. \"Jogadores\" é fixo e mostra sempre os personagens dos jogadores."),
      list,
      categories.length < MAX_ACTOR_CATEGORIES ? this.#creationRow(categories.length) : h("p", { class: "hint" }, `Limite de ${MAX_ACTOR_CATEGORIES} categorias.`),
    ];
  }

  #row(category: ActorCategory): HTMLElement {
    const color = h("input", { type: "color", value: category.color, "aria-label": `Cor de ${category.name}` });
    color.addEventListener("change", () => void updateActorCategory(category.id, { color: color.value }).catch(reportFailure));
    const name = h("input", { type: "text", value: category.name, maxlength: 40, "aria-label": "Nome da categoria" });
    name.addEventListener("change", () => {
      const value = name.value.trim();
      if (value) void updateActorCategory(category.id, { name: value }).catch(reportFailure);
    });
    const remove = h("button", { type: "button", class: "icon md-icon-button danger", title: "Apagar categoria", "aria-label": "Apagar categoria" }, h("i", { class: "fa-solid fa-trash" }));
    remove.addEventListener("click", async () => {
      const confirmed = await DialogV2.confirm({ window: { title: "Apagar categoria" }, content: h("p", {}, `Apagar "${category.name}"? Os atores continuam existindo.`), yes: { label: "Apagar" }, no: { label: "Cancelar" } });
      if (confirmed === true) await deleteActorCategory(category.id).then(() => this.render()).catch(reportFailure);
    });
    return h("li", { class: "md-category-row" }, color, name, h("span", { class: "md-chip-count" }, String(category.actorIds.length)), remove);
  }

  #creationRow(existingCount: number): HTMLElement {
    const color = h("input", { type: "color", value: CATEGORY_COLORS[existingCount % CATEGORY_COLORS.length], "aria-label": "Cor" });
    const name = h("input", { type: "text", maxlength: 40, placeholder: "Nova categoria (ex.: Elfos)", "aria-label": "Nome da nova categoria" });
    const add = h("button", { type: "button", class: "default" }, h("i", { class: "fa-solid fa-plus" }), " Criar");
    const create = () => {
      const value = name.value.trim();
      if (!value) return;
      void createActorCategory(value, color.value).then(() => this.render()).catch(reportFailure);
    };
    add.addEventListener("click", create);
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        create();
      }
    });
    return h("div", { class: "md-category-row md-category-new" }, color, name, add);
  }
}

/** Checkbox dialog for one actor's categories. */
export async function editActorCategoriesDialog(actor: any): Promise<void> {
  const categories = readActorCategories();
  if (categories.length === 0) {
    void new ActorCategoryManager().render({ force: true });
    return;
  }
  const list = h("div", { class: "md-chip-checks" });
  for (const category of categories) {
    const checked = category.actorIds.includes(actor.id);
    list.append(h("label", { class: "md-chip-check", style: `--chip-color:${category.color}` }, h("input", { type: "checkbox", value: category.id, checked }), h("span", {}, category.name)));
  }
  const confirmed = await DialogV2.prompt({ window: { title: `Categorias: ${actor.name}` }, content: list, ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => true } });
  if (confirmed !== true) return;
  const selected = new Set(Array.from(list.querySelectorAll<HTMLInputElement>("input:checked"), (input) => input.value));
  await setActorMembership([actor.id], selected).catch(reportFailure);
}
