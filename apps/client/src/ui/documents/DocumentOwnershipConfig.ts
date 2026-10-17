import { CONST, type ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { INHERIT_CHOICE, OWNERSHIP_CHOICES, ownershipChoiceFor, type OwnershipChoice } from "./ownershipLevels";

const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;

interface LevelPicker {
  root: HTMLElement;
  getLevel: () => number;
  setDefaultHint?: (defaultLevel: number) => void;
}

function choiceTitle(choice: OwnershipChoice): string {
  return `${choice.label} — ${choice.hint}`;
}

function levelPicker(name: string, selectedLevel: number, choices: readonly OwnershipChoice[], onChange?: (level: number) => void): LevelPicker {
  const hidden = h("input", { type: "hidden", name, value: String(selectedLevel), "data-dtype": "Number" }) as HTMLInputElement;
  const group = h("div", { class: "ownership-levels", role: "radiogroup", "aria-label": name === "default" ? "Todos os jogadores" : name });
  const buttons = new Map<number, HTMLButtonElement>();

  const select = (level: number) => {
    hidden.value = String(level);
    for (const [value, button] of buttons) {
      const active = value === level;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    }
    onChange?.(level);
  };

  for (const choice of choices) {
    const button = h(
      "button",
      {
        type: "button",
        class: `ownership-level${choice.level === selectedLevel ? " active" : ""}`,
        role: "radio",
        "aria-checked": String(choice.level === selectedLevel),
        title: choiceTitle(choice),
      },
      h("i", { class: choice.icon }),
      h("span", {}, choice.label),
    );
    button.addEventListener("click", () => select(choice.level));
    buttons.set(choice.level, button);
    group.append(button);
  }

  return {
    root: h("div", { class: "ownership-picker" }, hidden, group),
    getLevel: () => Number(hidden.value),
  };
}

function playerHint(resolved: OwnershipChoice, inherits: boolean): string {
  return inherits ? `Agora: ${resolved.label} (igual a todos)` : resolved.hint;
}

/** GM-only editor for who can see or edit a document (the default level plus per-player overrides). */
export class DocumentOwnershipConfig extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["document-ownership"],
    tag: "form",
    window: { title: "Visibilidade", frame: true, positioned: true, icon: "fa-solid fa-eye", controls: [], minimizable: false, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: 520 },
  };

  constructor(private readonly document: any) {
    super({ id: `ownership-${String(document.uuid).replaceAll(".", "-")}` });
  }

  override get title(): string {
    return `Visibilidade: ${this.document.name}`;
  }

  get #isEmbeddedPage(): boolean {
    return this.document.documentName === "JournalEntryPage";
  }

  buildContent(): Node[] {
    const ownership: Record<string, number> = this.document._source.ownership ?? {};
    const inheritChoice = this.#isEmbeddedPage
      ? { ...INHERIT_CHOICE, label: "Igual ao diário", hint: "Usa o mesmo acesso do diário" }
      : INHERIT_CHOICE;
    const defaultChoices = this.#isEmbeddedPage ? [inheritChoice, ...OWNERSHIP_CHOICES] : OWNERSHIP_CHOICES;
    const playerHintNodes: HTMLElement[] = [];
    const playerPickers: LevelPicker[] = [];

    const syncPlayerHints = (defaultLevel: number) => {
      const defaultChoice = ownershipChoiceFor(defaultLevel);
      for (const [index, picker] of playerPickers.entries()) {
        const level = picker.getLevel();
        const inherits = level === LEVELS.INHERIT;
        const resolved = inherits ? defaultChoice : ownershipChoiceFor(level);
        const hint = playerHintNodes[index];
        if (hint) hint.textContent = playerHint(resolved, inherits);
      }
    };

    const defaultPicker = levelPicker("default", ownership.default ?? LEVELS.NONE, defaultChoices, syncPlayerHints);
    const defaultSummary = h("p", { class: "ownership-summary" }, ownershipChoiceFor(ownership.default ?? LEVELS.NONE).hint);

    const updateDefaultSummary = (level: number) => {
      defaultSummary.textContent = ownershipChoiceFor(level).hint;
      syncPlayerHints(level);
    };
    // Re-wire default picker to also refresh the summary text.
    const defaultHidden = defaultPicker.root.querySelector<HTMLInputElement>("input[type=hidden]");
    for (const button of defaultPicker.root.querySelectorAll<HTMLButtonElement>(".ownership-level")) {
      button.addEventListener("click", () => updateDefaultSummary(Number(defaultHidden?.value)));
    }

    const rows: HTMLElement[] = [
      h("p", { class: "hint" }, "Defina o acesso de todos e, se precisar, mude só um jogador. Oculto não chega no navegador dele."),
      h(
        "section",
        { class: "ownership-section" },
        h("h3", { class: "ownership-section-title" }, "Todos os jogadores"),
        defaultPicker.root,
        defaultSummary,
      ),
    ];

    if (game.users.players.length > 0) {
      const playerRows: HTMLElement[] = [];
      for (const player of game.users.players) {
        const level = ownership[player.id] ?? LEVELS.INHERIT;
        const hint = h("p", { class: "ownership-summary" }, "");
        playerHintNodes.push(hint);
        const picker = levelPicker(player.id, level, [inheritChoice, ...OWNERSHIP_CHOICES], () => syncPlayerHints(defaultPicker.getLevel()));
        playerPickers.push(picker);
        playerRows.push(
          h(
            "div",
            { class: "ownership-player" },
            h("div", { class: "ownership-player-head" }, h("strong", {}, player.name), hint),
            picker.root,
          ),
        );
      }
      rows.push(
        h(
          "section",
          { class: "ownership-section" },
          h("h3", { class: "ownership-section-title" }, "Exceção por jogador"),
          h("p", { class: "hint ownership-section-hint" }, `Deixe em "${inheritChoice.label}" para seguir o acesso de todos. Só mude se alguém precisar de outro nível.`),
          ...playerRows,
        ),
      );
      syncPlayerHints(ownership.default ?? LEVELS.NONE);
    } else {
      rows.push(h("p", { class: "hint" }, "Nenhum jogador cadastrado ainda."));
    }

    const saveButton = h("button", { type: "submit", class: "default" }, h("i", { class: "fa-solid fa-floppy-disk" }), " Salvar");
    return [...rows, h("footer", { class: "form-footer" }, saveButton)];
  }

  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options);
    this.element.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#save();
    });
  }

  async #save(): Promise<void> {
    const form = this.element as HTMLFormElement;
    const current: Record<string, number> = this.document._source.ownership ?? {};
    const changes: Record<string, unknown> = {};
    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>("input[type=hidden][name]"))) {
      const level = Number(input.value);
      const key = input.name;
      if (level === LEVELS.INHERIT && key !== "default") {
        if (key in current) changes[`ownership.-=${key}`] = null;
      } else if (current[key] !== level) {
        changes[`ownership.${key}`] = level;
      }
    }
    if (Object.keys(changes).length > 0) await this.document.update(changes);
    await this.close();
  }
}
