import type { ApplicationConfiguration } from "@tabbletop/api";
import { ACTOR_ROLES, type ActorRole } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { defaultTemplateFor } from "../sheets/layout/sheetTemplateStore";
import { templatesForRole } from "../sheets/layout/templateDialogs";
import { readActorCategories } from "./actorCategoryStore";
import { clampQuantity, MAX_ACTORS_PER_CREATION } from "./actorCreationRules";
import { createActorsFromRequest } from "./actorFactory";
import { ROLE_PRESENTATION } from "./actorRoles";

const ROLE_HINTS: Readonly<Record<ActorRole, string>> = {
  player: "Personagem controlado por um jogador. Só ele e o mestre veem a ficha.",
  enemy: "Criatura hostil. Só o mestre vê a ficha; cada token tem a própria vida.",
  npc: "Aliado ou figurante. Só o mestre vê a ficha, a menos que ele libere.",
};

/** Guided creation for characters and enemies: role, owner, sheet model, quantity and the GM's categories. */
export class ActorCreationDialog extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "actor-creation",
    classes: ["md-create-actor"],
    tag: "form",
    window: { title: "Criar personagem", frame: true, positioned: true, icon: "fa-solid fa-user-plus", controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
    position: { width: 520 },
  };

  #role: ActorRole = game.user.isGM ? "enemy" : "player";
  #busy = false;
  #draftName = "";
  #welcome = false;

  /** Opened right after a player joins without a character yet. */
  static openWelcome(): Promise<unknown> {
    const dialog = new ActorCreationDialog();
    dialog.#welcome = true;
    return dialog.render({ force: true });
  }

  buildContent(): Node[] {
    const welcome = this.#welcome ? h("p", { class: "md-welcome" }, h("strong", {}, `Bem-vindo(a), ${game.user.name}!`), " Crie seu personagem para começar. Você pode fechar e criar depois pelo botão \"Criar personagem\" no topo.") : null;
    const switcher = game.user.isGM ? this.#roleSwitcher() : null;
    return [welcome, switcher, h("p", { class: "hint md-role-hint" }, ROLE_HINTS[this.#role]), ...this.#fields(), this.#footer()].filter((node): node is HTMLElement => node !== null);
  }

  #roleSwitcher(): HTMLElement {
    const roles = game.user.isGM ? ACTOR_ROLES : (["player"] as const);
    const group = h("div", { class: "md-segmented", role: "radiogroup", "aria-label": "Tipo" });
    for (const role of roles) {
      const presentation = ROLE_PRESENTATION[role];
      const button = h("button", { type: "button", class: `md-segment${role === this.#role ? " active" : ""}`, role: "radio", "aria-checked": String(role === this.#role) }, h("i", { class: presentation.icon }), ` ${presentation.label}`);
      button.addEventListener("click", () => {
        this.#role = role;
        void this.render();
      });
      group.append(button);
    }
    return group;
  }

  #fields(): HTMLElement[] {
    const isGM = game.user.isGM;
    const picker = document.createElement("file-picker");
    picker.setAttribute("name", "img");
    picker.setAttribute("type", "image");
    picker.setAttribute("placeholder", "Imagem (opcional)");
    const nameInput = h("input", { type: "text", name: "name", required: true, maxlength: 80, value: this.#draftName, placeholder: this.#role === "enemy" ? "Ex.: Goblin" : "Ex.: Lyra" });
    nameInput.addEventListener("input", () => {
      this.#draftName = nameInput.value;
    });
    const templateField = isGM ? this.#group("Modelo de ficha", this.#templateSelect()) : h("input", { type: "hidden", name: "templateId", value: defaultTemplateFor("player")?.id ?? "" });
    const fields = [this.#group("Nome do personagem", nameInput), this.#group("Retrato (opcional)", picker), templateField];
    if (isGM && this.#role === "player") fields.splice(1, 0, this.#group("Jogador", this.#ownerSelect()));
    if (isGM && this.#role !== "player") fields.push(this.#group("Quantidade", h("input", { type: "number", name: "quantity", value: "1", min: 1, max: MAX_ACTORS_PER_CREATION, title: "Cria vários numerados: Goblin 1, Goblin 2..." })));
    if (isGM) fields.push(this.#categoryPicker());
    return fields;
  }

  #group(label: string, control: HTMLElement): HTMLElement {
    return h("label", { class: "form-group md-dialog-group" }, h("span", {}, label), control);
  }

  #templateSelect(): HTMLSelectElement {
    const select = h("select", { name: "templateId" });
    for (const template of templatesForRole(this.#role)) {
      select.append(h("option", { value: template.id, title: template.description ?? "" }, `${template.name}${template.role === this.#role ? "" : ` (${ROLE_PRESENTATION[template.role].label})`}`));
    }
    return select;
  }

  #ownerSelect(): HTMLSelectElement {
    const select = h("select", { name: "ownerId" }, h("option", { value: "" }, "Decidir depois"));
    for (const player of game.users.players) select.append(h("option", { value: player.id }, player.name));
    return select;
  }

  #categoryPicker(): HTMLElement {
    const categories = readActorCategories();
    const list = h("div", { class: "md-chip-checks" });
    for (const category of categories) {
      list.append(h("label", { class: "md-chip-check", style: `--chip-color:${category.color}` }, h("input", { type: "checkbox", name: "category", value: category.id }), h("span", {}, category.name)));
    }
    if (categories.length === 0) list.append(h("span", { class: "hint" }, "Nenhuma categoria ainda. Crie na aba Atores (botão de etiqueta)."));
    return h("fieldset", { class: "md-fieldset" }, h("legend", {}, "Categorias (só você vê)"), list);
  }

  #footer(): HTMLElement {
    const label = game.user.isGM ? `Criar ${ROLE_PRESENTATION[this.#role].label.toLowerCase()}` : "Criar personagem";
    const submit = h("button", { type: "submit", class: "default" }, h("i", { class: "fa-solid fa-plus" }), ` ${label}`);
    return h("footer", { class: "form-footer" }, submit);
  }

  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.element.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#create();
    });
  }

  async #create(): Promise<void> {
    if (this.#busy) return;
    const form = this.element as HTMLFormElement;
    const read = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value?.trim() ?? "";
    const name = read("name");
    if (!name) {
      ui.notifications.warn("Dê um nome ao personagem.");
      return;
    }
    this.#busy = true;
    try {
      const imagePicker = form.querySelector<HTMLElement & { value: string }>("file-picker[name=img]");
      const categoryIds = Array.from(form.querySelectorAll<HTMLInputElement>("input[name=category]:checked"), (input) => input.value);
      const created = await createActorsFromRequest({ name: name.slice(0, 80), img: imagePicker?.value ?? "", role: this.#role, templateId: read("templateId"), ownerId: read("ownerId") || null, quantity: clampQuantity(Number(read("quantity") || 1)), categoryIds });
      ui.notifications.info(created.length > 1 ? `${created.length} fichas criadas.` : `"${created[0]?.name}" criado.`);
      await this.close();
      if (created.length === 1) void created[0].sheet?.render(true);
    } catch (error) {
      ui.notifications.error(error instanceof Error ? error.message : "Não foi possível criar.");
    } finally {
      this.#busy = false;
    }
  }
}
