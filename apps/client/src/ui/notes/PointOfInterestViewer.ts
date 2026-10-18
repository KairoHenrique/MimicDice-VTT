import { escapeHTML, type ApplicationConfiguration } from "@tabbletop/api";
import { readPointOfInterest, type PointOfInterest } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { buildJournalPagesSection } from "../sheets/journalPagesSection";
import { configurePointOfInterest } from "./PointOfInterestConfigDialog";

export class PointOfInterestViewer extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["poi-viewer", "standard-form"],
    window: {
      title: "Ponto de Interesse",
      frame: true,
      positioned: true,
      icon: "fa-solid fa-map-location-dot",
      controls: [],
      minimizable: true,
      resizable: true,
      contentTag: "section",
      contentClasses: ["poi-viewer-content"],
    },
    position: { width: 500 },
  };

  constructor(private readonly note: any) {
    super({ id: `poi-viewer-${note.document.id}` });
  }

  get #poi(): PointOfInterest | null {
    const flags = this.note.document.flags?.world ?? this.note.document._source?.flags?.world;
    return readPointOfInterest(flags);
  }

  get #entry(): any {
    const entry = this.note.document.entry;
    return entry?.testUserPermission?.(game.user, "LIMITED") ? entry : null;
  }

  override get title(): string {
    const poi = this.#poi;
    if (poi?.title) return poi.title;
    return this.#entry?.name || this.note.document.text || "Ponto de Interesse";
  }

  buildContent(): Node[] {
    const poi = this.#poi;
    const isGM = game.user.isGM;
    const canEdit = this.note.canDragWithoutControl(game.user);

    if (poi) {
      return this.#buildPoiContent(poi, isGM, canEdit);
    }
    return this.#buildLegacyContent(isGM, canEdit);
  }

  #buildPoiContent(poi: PointOfInterest, isGM: boolean, canEdit: boolean): Node[] {
    const content: Node[] = [];

    // Header Hero Banner
    const heroClasses = ["poi-viewer-hero"];
    if (poi.image) {
      heroClasses.push("has-cover");
    }

    const iconBadge = h(
      "div",
      {
        class: "poi-viewer-icon-badge",
        style: `background-color: ${poi.color};`,
      },
      h("img", { src: poi.icon, alt: "" }),
    );

    const titleElements: Node[] = [];
    if (poi.category) {
      titleElements.push(h("span", { class: "poi-viewer-category-tag" }, poi.category));
    }
    titleElements.push(h("h2", { class: "poi-viewer-title" }, poi.title));

    if (isGM && poi.hidden) {
      titleElements.push(
        h(
          "span",
          { class: "poi-viewer-hidden-alert" },
          h("i", { class: "fa-solid fa-eye-slash" }),
          " Oculto dos jogadores",
        ),
      );
    }

    const headerContent = h("div", { class: "poi-viewer-header-content" }, iconBadge, h("div", { class: "poi-viewer-titles" }, ...titleElements));

    const hero = h(
      "div",
      { class: heroClasses.join(" ") },
      h("div", { class: "poi-viewer-hero-overlay" }),
      headerContent,
    );
    if (poi.image) {
      hero.style.backgroundImage = `url('${encodeURI(poi.image)}')`;
    }
    content.push(hero);

    // Body container
    const bodyElements: Node[] = [];

    // Description for everyone
    const descriptionText = poi.description.trim();
    bodyElements.push(
      h(
        "div",
        { class: "poi-viewer-description" },
        descriptionText || (isGM ? "Nenhuma descrição definida pelo mestre. Clique em 'Editar' para adicionar detalhes." : "Nenhuma informação detalhada sobre este local."),
      ),
    );

    // Secret GM notes (if user is GM and notes exist)
    if (isGM && poi.gmNotes.trim()) {
      bodyElements.push(
        h(
          "div",
          { class: "poi-viewer-secret-card" },
          h(
            "div",
            { class: "poi-viewer-secret-title" },
            h("i", { class: "fa-solid fa-user-secret" }),
            " Notas Secretas do Mestre",
          ),
          h("div", { class: "poi-viewer-secret-content" }, poi.gmNotes.trim()),
        ),
      );
    }

    // Optional linked journal
    const entry = this.#entry;
    if (entry) {
      bodyElements.push(buildJournalPagesSection(entry, false));
    }

    const body = h("div", { class: "poi-viewer-body" }, ...bodyElements);
    content.push(body);

    // Footer actions
    const actions: HTMLElement[] = [];

    // Share to chat button
    const shareBtn = h(
      "button",
      { type: "button", title: "Compartilhar este local no chat" },
      h("i", { class: "fa-solid fa-comment" }),
      " Enviar ao Chat",
    );
    shareBtn.addEventListener("click", () => void this.#shareToChat(poi));
    actions.push(shareBtn);

    // Edit button (GM / canEdit)
    if (canEdit) {
      const editBtn = h(
        "button",
        { type: "button", class: "primary" },
        h("i", { class: "fa-solid fa-pen" }),
        " Editar Local",
      );
      editBtn.addEventListener("click", () => {
        void this.close();
        void configurePointOfInterest(this.note);
      });
      actions.push(editBtn);
    }

    // Open journal if linked
    if (entry) {
      const openJournalBtn = h(
        "button",
        { type: "button" },
        h("i", { class: "fa-solid fa-book-open" }),
        " Diário",
      );
      openJournalBtn.addEventListener("click", () => entry.sheet?.render(true));
      actions.push(openJournalBtn);
    }

    content.push(h("footer", { class: "form-footer" }, ...actions));
    return content;
  }

  #buildLegacyContent(isGM: boolean, canEdit: boolean): Node[] {
    const text = String(this.note.document.text ?? "").trim();
    const entry = this.#entry;
    const content: Node[] = [];

    const bodyElements: Node[] = [];
    if (text) bodyElements.push(h("p", { class: "note-viewer-text" }, text));
    if (entry) bodyElements.push(buildJournalPagesSection(entry, false));
    if (!text && !entry) bodyElements.push(h("p", { class: "hint" }, "Esta nota está vazia."));

    content.push(h("div", { class: "poi-viewer-body" }, ...bodyElements));

    const actions: HTMLElement[] = [];
    if (entry) {
      const open = h("button", { type: "button" }, h("i", { class: "fa-solid fa-book-open" }), " Abrir diário");
      open.addEventListener("click", () => entry.sheet?.render(true));
      actions.push(open);
    }

    if (canEdit) {
      const edit = h(
        "button",
        { type: "button", class: "primary" },
        h("i", { class: "fa-solid fa-wand-magic-sparkles" }),
        " Configurar Ponto de Interesse",
      );
      edit.addEventListener("click", () => {
        void this.close();
        void configurePointOfInterest(this.note);
      });
      actions.push(edit);
    }

    if (actions.length > 0) content.push(h("footer", { class: "form-footer" }, ...actions));
    return content;
  }

  async #shareToChat(poi: PointOfInterest): Promise<void> {
    const categoryHtml = poi.category ? `<div class="chat-poi-card-category">${escapeHTML(poi.category)}</div>` : "";
    const coverHtml = poi.image ? `<img class="chat-poi-card-cover" src="${escapeHTML(poi.image)}" alt="" />` : "";
    const descHtml = poi.description ? `<p class="chat-poi-card-desc">${escapeHTML(poi.description)}</p>` : "";

    const html = `
<div class="chat-poi-card">
  <div class="chat-poi-card-header">
    <div class="chat-poi-card-icon" style="background-color: ${escapeHTML(poi.color)};">
      <img src="${escapeHTML(poi.icon)}" alt="" />
    </div>
    <div>
      ${categoryHtml}
      <h4 class="chat-poi-card-title">${escapeHTML(poi.title)}</h4>
    </div>
  </div>
  ${coverHtml}
  ${descHtml}
</div>
`.trim();

    await ChatMessage.create({ content: html });
    ui?.notifications?.info(`"${poi.title}" foi compartilhado no chat!`);
  }
}
