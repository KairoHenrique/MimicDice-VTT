import type { ApplicationConfiguration } from "@tabbletop/api";
import {
  DEFAULT_POI_COLOR,
  DEFAULT_POI_ICON,
  DEFAULT_POI_SIZE,
  POI_CATEGORY_PRESETS,
  createPointOfInterestSource,
  readPointOfInterest,
  type PointOfInterest,
} from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";

const COLOR_SWATCHES = [
  "#eab308", // Golden / Tavern
  "#ef4444", // Crimson / Forge
  "#f97316", // Orange / Steel
  "#10b981", // Emerald / Market
  "#06b6d4", // Cyan / Divine
  "#3b82f6", // Blue / Castle
  "#6366f1", // Indigo / Guard
  "#8b5cf6", // Purple / Alchemy
  "#d946ef", // Fuchsia / Quest
  "#ec4899", // Pink / Landmark
  "#dc2626", // Danger / Skull
  "#fafafa", // Pure white
];

const AVAILABLE_ICONS = [
  { icon: "icons/svg/tavern.svg", label: "Taverna" },
  { icon: "icons/svg/blacksmith.svg", label: "Ferreiro" },
  { icon: "icons/svg/weapons.svg", label: "Armas" },
  { icon: "icons/svg/shop.svg", label: "Comércio" },
  { icon: "icons/svg/alchemy.svg", label: "Alquimia" },
  { icon: "icons/svg/temple.svg", label: "Templo" },
  { icon: "icons/svg/castle.svg", label: "Castelo" },
  { icon: "icons/svg/shield.svg", label: "Guarda" },
  { icon: "icons/svg/skull.svg", label: "Perigo" },
  { icon: "icons/svg/mystery.svg", label: "Mistério" },
  { icon: "icons/svg/pin.svg", label: "Marcador" },
  { icon: "icons/svg/book.svg", label: "Diário" },
];

export class PointOfInterestConfigDialog extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["poi-config-dialog", "standard-form"],
    window: {
      title: "Configurar Ponto de Interesse",
      frame: true,
      positioned: true,
      icon: "fa-solid fa-map-location-dot",
      controls: [],
      minimizable: false,
      resizable: true,
      contentTag: "section",
      contentClasses: ["poi-config-content"],
    },
    position: { width: 560 },
  };

  #selectedIcon: string;
  #selectedColor: string;
  #settle: ((result: Record<string, unknown> | null) => void) | null = null;
  #saved = false;

  constructor(
    private readonly note: any | null,
    private readonly initial: Record<string, unknown> = {},
    settle?: (result: Record<string, unknown> | null) => void,
  ) {
    super({ id: `poi-config-${note?.document?.id ?? "new"}` });
    this.#settle = settle ?? null;

    const source = note?.document ?? initial;
    const existingPoi = readPointOfInterest(source?.flags?.world ?? source?._source?.flags?.world);

    this.#selectedIcon = existingPoi?.icon || source?.texture?.src || DEFAULT_POI_ICON;
    this.#selectedColor = existingPoi?.color || source?.texture?.tint || DEFAULT_POI_COLOR;
  }

  override get title(): string {
    return this.note ? "Editar Ponto de Interesse" : "Novo Ponto de Interesse";
  }

  override async close(options?: { animate?: boolean }): Promise<this> {
    if (!this.#saved && this.#settle) {
      this.#settle(null);
      this.#settle = null;
    }
    return super.close(options);
  }

  buildContent(): Node[] {
    const source = this.note?.document ?? this.initial;
    const existingPoi = readPointOfInterest(source?.flags?.world ?? source?._source?.flags?.world);

    let currentTitle = existingPoi?.title || source?.text || "";
    let currentCategory = existingPoi?.category || "";
    let currentDescription = existingPoi?.description || "";
    let currentGmNotes = existingPoi?.gmNotes || "";
    let currentImage = existingPoi?.image || "";
    let isHidden = existingPoi?.hidden ?? (source?.flags?.world?.hidden === true);
    let isGlobal = source?.global !== false;
    let currentSize = Number(source?.iconSize) || DEFAULT_POI_SIZE;
    let currentEntryId = source?.entryId || "";

    // DOM Elements for dynamic live preview
    const previewMarker = h("div", { class: "poi-preview-marker", style: `background-color: ${this.#selectedColor};` });
    const previewImg = h("img", { src: this.#selectedIcon, alt: "" });
    previewMarker.append(previewImg);

    const previewBadge = h("span", { class: "poi-preview-badge" }, currentCategory || "Ponto de Interesse");
    const previewTitle = h("h3", { class: "poi-preview-title" }, currentTitle || "Novo Ponto de Interesse");
    const previewHint = h("span", { class: "poi-preview-hint" }, "Clique no mapa para abrir as informações");

    const previewCard = h(
      "div",
      { class: "poi-preview-card" },
      previewMarker,
      h("div", { class: "poi-preview-info" }, previewBadge, previewTitle, previewHint),
    );

    const updatePreview = () => {
      previewMarker.style.backgroundColor = this.#selectedColor;
      previewImg.src = this.#selectedIcon;
      previewBadge.textContent = currentCategory || "Ponto de Interesse";
      previewTitle.textContent = currentTitle || "Novo Ponto de Interesse";
    };

    // Category Presets
    const presetButtons: HTMLElement[] = [];
    const presetsGrid = h("div", { class: "poi-presets-grid" });

    for (const preset of POI_CATEGORY_PRESETS) {
      const btn = h(
        "button",
        {
          type: "button",
          class: `poi-preset-btn ${this.#selectedIcon === preset.icon ? "active" : ""}`,
        },
        h("span", { class: "poi-preset-icon" }, h("img", { src: preset.icon, alt: "" })),
        h("span", {}, preset.label),
      );

      btn.addEventListener("click", () => {
        for (const other of presetButtons) other.classList.remove("active");
        btn.classList.add("active");

        this.#selectedIcon = preset.icon;
        this.#selectedColor = preset.color;

        // Auto-fill category & title if empty or was previous default
        if (!currentTitle || POI_CATEGORY_PRESETS.some((p) => p.defaultTitle === currentTitle)) {
          currentTitle = preset.defaultTitle;
          titleInput.value = preset.defaultTitle;
        }
        currentCategory = preset.label;
        categoryInput.value = preset.label;

        colorInput.value = preset.color;
        for (const swatch of swatches) {
          swatch.classList.toggle("active", swatch.dataset.color === preset.color);
        }
        for (const iconChoice of iconChoices) {
          iconChoice.classList.toggle("active", iconChoice.dataset.icon === preset.icon);
        }

        updatePreview();
      });

      presetButtons.push(btn);
      presetsGrid.append(btn);
    }

    // Title input
    const titleInput = h("input", {
      type: "text",
      id: "poi-title-input",
      placeholder: "Ex: Taverna do Bode Bêbado, Forja Imperial, Loja de Armas...",
      value: currentTitle,
      required: true,
      maxlength: 120,
    });
    titleInput.addEventListener("input", () => {
      currentTitle = titleInput.value.trim();
      updatePreview();
    });

    // Category input
    const categoryInput = h("input", {
      type: "text",
      id: "poi-category-input",
      placeholder: "Ex: Taverna, Ferreiro, Armas, Alquimia, Ponto de Interesse...",
      value: currentCategory,
      maxlength: 60,
    });
    categoryInput.addEventListener("input", () => {
      currentCategory = categoryInput.value.trim();
      updatePreview();
    });

    // Icon grid
    const iconChoices: HTMLElement[] = [];
    const iconGrid = h("div", { class: "poi-icon-grid" });
    for (const item of AVAILABLE_ICONS) {
      const choice = h(
        "button",
        {
          type: "button",
          class: `poi-icon-choice ${this.#selectedIcon === item.icon ? "active" : ""}`,
          title: item.label,
          "data-icon": item.icon,
        },
        h("img", { src: item.icon, alt: item.label }),
      );
      choice.addEventListener("click", () => {
        for (const other of iconChoices) other.classList.remove("active");
        choice.classList.add("active");
        this.#selectedIcon = item.icon;
        updatePreview();
      });
      iconChoices.push(choice);
      iconGrid.append(choice);
    }

    // Color swatches & picker
    const swatches: HTMLElement[] = [];
    const colorPalette = h("div", { class: "poi-color-palette" });
    for (const color of COLOR_SWATCHES) {
      const swatch = h("button", {
        type: "button",
        class: `poi-color-swatch ${this.#selectedColor.toLowerCase() === color.toLowerCase() ? "active" : ""}`,
        style: `background-color: ${color};`,
        title: color,
        "data-color": color,
      });
      swatch.addEventListener("click", () => {
        for (const other of swatches) other.classList.remove("active");
        swatch.classList.add("active");
        this.#selectedColor = color;
        colorInput.value = color;
        updatePreview();
      });
      swatches.push(swatch);
      colorPalette.append(swatch);
    }

    const colorInput = h("input", {
      type: "color",
      class: "poi-custom-color",
      value: this.#selectedColor,
      title: "Escolher cor personalizada",
    });
    colorInput.addEventListener("input", () => {
      for (const other of swatches) other.classList.remove("active");
      this.#selectedColor = colorInput.value;
      updatePreview();
    });
    colorPalette.append(colorInput);

    // Cover image URL
    const imageInput = h("input", {
      type: "text",
      id: "poi-image-input",
      placeholder: "https://exemplo.com/taverna.png ou caminho de arquivo",
      value: currentImage,
    });
    imageInput.addEventListener("input", () => {
      currentImage = imageInput.value.trim();
    });

    // Description textarea
    const descTextarea = h("textarea", {
      id: "poi-description-input",
      rows: 4,
      placeholder: "Descreva o local para os jogadores: atmosfera, comidas, bebidas, armas à venda, preços, serviços ou personagens presentes...",
    });
    descTextarea.value = currentDescription;
    descTextarea.addEventListener("input", () => {
      currentDescription = descTextarea.value;
    });

    // Secret GM notes textarea
    const gmNotesTextarea = h("textarea", {
      id: "poi-gm-notes-input",
      rows: 3,
      placeholder: "Anotações exclusivas do mestre: segredos, preços especiais, itens ilegais sob o balcão, pistas para missões, conspirações...",
    });
    gmNotesTextarea.value = currentGmNotes;
    gmNotesTextarea.addEventListener("input", () => {
      currentGmNotes = gmNotesTextarea.value;
    });

    const gmSecretBox = h(
      "div",
      { class: "poi-secret-box" },
      h(
        "div",
        { class: "poi-secret-header" },
        h("span", { class: "poi-secret-label" }, h("i", { class: "fa-solid fa-user-secret" }), " Notas Secretas do Mestre"),
        h("span", { class: "poi-secret-tag" }, "Apenas Mestre"),
      ),
      gmNotesTextarea,
    );

    // Visibility and Layer options
    const hiddenCheckbox = h("input", { type: "checkbox", id: "poi-hidden-input" });
    hiddenCheckbox.checked = isHidden;
    hiddenCheckbox.addEventListener("change", () => {
      isHidden = hiddenCheckbox.checked;
    });

    const globalCheckbox = h("input", { type: "checkbox", id: "poi-global-input" });
    globalCheckbox.checked = isGlobal;
    globalCheckbox.addEventListener("change", () => {
      isGlobal = globalCheckbox.checked;
    });

    // Icon size selector
    const sizeSelect = h(
      "select",
      { id: "poi-size-select" },
      h("option", { value: "36" }, "Pequeno (36px)"),
      h("option", { value: "44" }, "Médio (44px - Padrão)"),
      h("option", { value: "52" }, "Grande (52px)"),
      h("option", { value: "64" }, "Extra Grande (64px)"),
    );
    sizeSelect.value = String(currentSize);
    sizeSelect.addEventListener("change", () => {
      currentSize = Number(sizeSelect.value) || DEFAULT_POI_SIZE;
    });

    // Linked Journal Entry (Optional)
    const journalChoices = (game?.journal?.contents ?? []).map((entry: any) =>
      h("option", { value: entry.id }, entry.name || "Sem nome"),
    );
    const journalSelect = h(
      "select",
      { id: "poi-journal-select" },
      h("option", { value: "" }, "(Nenhum diário vinculado)"),
      ...journalChoices,
    );
    journalSelect.value = currentEntryId;
    journalSelect.addEventListener("change", () => {
      currentEntryId = journalSelect.value;
    });

    // Save action
    const saveButton = h(
      "button",
      { type: "button", class: "primary" },
      h("i", { class: "fa-solid fa-check" }),
      " Salvar Ponto",
    );
    saveButton.addEventListener("click", () => {
      const finalTitle = titleInput.value.trim() || "Ponto de Interesse";
      const finalCategory = categoryInput.value.trim();
      const finalDescription = descTextarea.value.trim();
      const finalGmNotes = gmNotesTextarea.value.trim();
      const finalImage = imageInput.value.trim();

      const poiData: PointOfInterest = {
        title: finalTitle,
        category: finalCategory,
        icon: this.#selectedIcon,
        color: this.#selectedColor,
        description: finalDescription,
        gmNotes: finalGmNotes,
        image: finalImage,
        hidden: isHidden,
      };

      const sourceData = createPointOfInterestSource(poiData, currentSize);
      sourceData.global = isGlobal;
      sourceData.entryId = currentEntryId || null;

      this.#saved = true;
      if (this.#settle) {
        this.#settle(sourceData);
        this.#settle = null;
      }
      void this.close();
    });

    const cancelButton = h(
      "button",
      { type: "button" },
      h("i", { class: "fa-solid fa-xmark" }),
      " Cancelar",
    );
    cancelButton.addEventListener("click", () => {
      void this.close();
    });

    const container = h(
      "div",
      { class: "poi-config-container" },
      // Section 1: Presets
      h(
        "div",
        { class: "poi-presets-section" },
        h("div", { class: "poi-section-label" }, h("i", { class: "fa-solid fa-wand-magic-sparkles" }), " Modelos Rápidos de Locais"),
        presetsGrid,
      ),
      // Section 2: Live Preview
      previewCard,
      // Section 3: Name & Category
      h(
        "div",
        { class: "form-group" },
        h("label", { for: "poi-title-input" }, "Nome do Local"),
        titleInput,
      ),
      h(
        "div",
        { class: "form-group" },
        h("label", { for: "poi-category-input" }, "Categoria"),
        categoryInput,
      ),
      // Section 4: Icon & Color
      h(
        "div",
        { class: "poi-appearance-row" },
        h(
          "div",
          { class: "form-group" },
          h("label", {}, "Ícone do Marcador"),
          iconGrid,
        ),
        h(
          "div",
          { class: "form-group" },
          h("label", {}, "Cor do Marcador"),
          colorPalette,
        ),
      ),
      // Section 5: Cover Image
      h(
        "div",
        { class: "form-group" },
        h("label", { for: "poi-image-input" }, "Imagem / Banner Ilustrativo (Opcional)"),
        imageInput,
      ),
      // Section 6: Description for players
      h(
        "div",
        { class: "form-group" },
        h("label", { for: "poi-description-input" }, "Informações do Local (Visível aos Jogadores)"),
        descTextarea,
      ),
      // Section 7: Secret GM Notes
      gmSecretBox,
      // Section 8: Options
      h(
        "fieldset",
        { class: "form-fieldset" },
        h("legend", {}, "Opções de Visibilidade e Mapa"),
        h(
          "label",
          { class: "checkbox-label" },
          hiddenCheckbox,
          " Ocultar dos jogadores (apenas o mestre verá este ponto no mapa)",
        ),
        h(
          "label",
          { class: "checkbox-label" },
          globalCheckbox,
          " Visível em todas as camadas do mapa",
        ),
        h(
          "div",
          { class: "form-group", style: "margin-top: 8px;" },
          h("label", { for: "poi-size-select" }, "Tamanho do Marcador no Mapa"),
          sizeSelect,
        ),
        h(
          "div",
          { class: "form-group", style: "margin-top: 8px;" },
          h("label", { for: "poi-journal-select" }, "Vincular a um Diário (Opcional)"),
          journalSelect,
        ),
      ),
      // Footer
      h("footer", { class: "form-footer" }, saveButton, cancelButton),
    );

    return [container];
  }
}

/** Opens the POI configuration dialog and resolves when saved, or null when closed/canceled. */
export function configurePointOfInterest(
  note: any | null,
  initial: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  return new Promise<Record<string, unknown> | null>((resolve) => {
    const dialog = new PointOfInterestConfigDialog(note, initial, async (result) => {
      if (result && note) {
        await note.document.update(result);
      }
      resolve(result);
    });
    void dialog.render({ force: true });
  });
}
