import type { ActorCategory } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { exportSystemDialog, importSheetsDialog } from "../sheets/layout/sheetExchange";
import { DocumentDirectory } from "../sidebar/DocumentDirectory";
import { ActorCategoryManager, editActorCategoriesDialog } from "./ActorCategoryManager";
import { addActorsToCategory, readActorCategories } from "./actorCategoryStore";
import { ActorCreationDialog } from "./ActorCreationDialog";
import { countMembers, filterActors, FILTER_ALL, FILTER_PLAYERS } from "./actorFilters";
import { actorRole, isPlayerCharacter, ROLE_PRESENTATION } from "./actorRoles";

const SEARCH_DEBOUNCE_MS = 120;

function draggedActorId(event: DragEvent): string | null {
  try {
    const data = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "{}");
    const uuid = typeof data.uuid === "string" ? data.uuid : "";
    const [documentName, actorId] = uuid.split(".");
    return documentName === "Actor" && /^[A-Za-z0-9]{16}$/.test(actorId ?? "") ? actorId : null;
  } catch {
    return null;
  }
}

/** Actors tab: the GM filters by the fixed "Jogadores" chip or by private categories he names himself. */
export class ActorDirectory extends DocumentDirectory {
  static override documentName = "Actor";
  static override tabName = "actors";
  static override tabLabel = "Atores";
  static override tabIcon = "fa-solid fa-user";

  #filterId = FILTER_ALL;
  #query = "";
  #searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected override get createLabel(): string {
    return game.user.isGM ? "Criar personagem ou inimigo" : "Criar meu personagem";
  }

  protected override get emptyMessage(): string {
    if (this.#filterId !== FILTER_ALL || this.#query) return "Ninguém neste filtro.";
    return game.user.isGM ? "Nenhum ator ainda." : "Você ainda não tem personagem. Crie o seu!";
  }

  protected override onCreateClick(): unknown {
    return new ActorCreationDialog().render({ force: true });
  }

  protected override filterDocuments(documents: any[]): any[] {
    if (!game.user.isGM) return documents;
    const categories = readActorCategories();
    if (this.#filterId !== FILTER_ALL && this.#filterId !== FILTER_PLAYERS && !categories.some((category) => category.id === this.#filterId)) this.#filterId = FILTER_ALL;
    const filterable = documents.map((actor) => ({ id: actor.id, name: String(actor.name ?? ""), isPlayerCharacter: isPlayerCharacter(actor), actor }));
    return filterActors(filterable, this.#filterId, categories, this.#query).map((entry) => entry.actor);
  }

  protected override buildToolbar(): Node[] {
    if (!game.user.isGM) return [];
    return [h("div", { class: "md-directory-tools" }, this.#searchInput(), this.#chipBar(), this.#sheetExchangeButtons())];
  }

  #sheetExchangeButtons(): HTMLElement {
    const importButton = h("button", { type: "button", title: "Importar ficha ou sistema de um arquivo .mimicdice.json" }, h("i", { class: "fa-solid fa-file-import" }), " Importar fichas");
    importButton.addEventListener("click", () => void importSheetsDialog());
    const exportButton = h("button", { type: "button", title: "Salvar seus modelos de ficha em um arquivo para compartilhar" }, h("i", { class: "fa-solid fa-file-export" }), " Exportar sistema");
    exportButton.addEventListener("click", () => void exportSystemDialog());
    return h("div", { class: "md-exchange-row" }, importButton, exportButton);
  }

  protected override entryBadges(entry: any): Node[] {
    const role = actorRole(entry);
    const badges: Node[] = [h("i", { class: `md-entry-role role-${role} ${ROLE_PRESENTATION[role].icon}`, title: ROLE_PRESENTATION[role].label })];
    if (game.user.isGM) {
      const dots = readActorCategories().filter((category) => category.actorIds.includes(entry.id));
      if (dots.length) badges.push(h("span", { class: "md-entry-dots" }, ...dots.map((category) => h("span", { class: "md-dot", style: `background:${category.color}`, title: category.name }))));
    }
    return badges;
  }

  protected override buildExtraControls(entry: any): HTMLElement[] {
    if (!game.user.isGM) return [];
    return [this.control("fa-solid fa-tags", "Categorias", () => editActorCategoriesDialog(entry))];
  }

  #searchInput(): HTMLElement {
    const input = h("input", { type: "search", class: "md-search", placeholder: "Buscar por nome...", value: this.#query, "aria-label": "Buscar atores" });
    input.addEventListener("input", () => {
      clearTimeout(this.#searchTimer);
      this.#searchTimer = setTimeout(() => {
        this.#query = input.value;
        void this.render().then(() => this.#refocusSearch());
      }, SEARCH_DEBOUNCE_MS);
    });
    return h("div", { class: "md-search-wrap" }, h("i", { class: "fa-solid fa-magnifying-glass" }), input);
  }

  #refocusSearch(): void {
    const input = this.element?.querySelector<HTMLInputElement>(".md-search");
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  #chipBar(): HTMLElement {
    const categories = readActorCategories();
    const actorIds = new Set<string>(this.collection.contents.map((actor: any) => actor.id));
    const counts = countMembers(categories, actorIds);
    const playerCount = this.collection.contents.filter((actor: any) => isPlayerCharacter(actor)).length;
    const bar = h(
      "div",
      { class: "md-chips", role: "toolbar", "aria-label": "Filtros" },
      this.#chip(FILTER_ALL, "Todos", this.collection.size, null, "fa-solid fa-layer-group"),
      this.#chip(FILTER_PLAYERS, "Jogadores", playerCount, null, ROLE_PRESENTATION.player.icon),
      ...categories.map((category) => this.#chip(category.id, category.name, counts.get(category.id) ?? 0, category)),
    );
    const manage = h("button", { type: "button", class: "md-chip md-chip-add", title: "Criar e organizar categorias" }, h("i", { class: "fa-solid fa-plus" }), " Categoria");
    manage.addEventListener("click", () => void new ActorCategoryManager().render({ force: true }));
    bar.append(manage);
    return bar;
  }

  #chip(filterId: string, label: string, count: number, category: ActorCategory | null, icon?: string): HTMLElement {
    const active = this.#filterId === filterId;
    const chip = h(
      "button",
      { type: "button", class: `md-chip${active ? " active" : ""}`, "aria-pressed": String(active), style: category ? `--chip-color:${category.color}` : "", title: category ? "Arraste atores até aqui para incluir" : label },
      icon ? h("i", { class: icon }) : h("span", { class: "md-dot" }),
      ` ${label}`,
      h("span", { class: "md-chip-count" }, String(count)),
    );
    chip.addEventListener("click", () => {
      this.#filterId = filterId;
      void this.render();
    });
    if (category) this.#acceptActorDrops(chip, category);
    return chip;
  }

  #acceptActorDrops(chip: HTMLElement, category: ActorCategory): void {
    chip.addEventListener("dragover", (event) => {
      event.preventDefault();
      chip.classList.add("drop-target");
    });
    chip.addEventListener("dragleave", () => chip.classList.remove("drop-target"));
    chip.addEventListener("drop", (event) => {
      event.preventDefault();
      chip.classList.remove("drop-target");
      const actorId = draggedActorId(event);
      if (actorId) void addActorsToCategory(category.id, [actorId]).then(() => ui.notifications.info(`Adicionado a "${category.name}".`));
    });
  }
}
