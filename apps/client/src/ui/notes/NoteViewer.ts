import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { buildJournalPagesSection } from "../sheets/journalPagesSection";

/** What a map note says: its own text plus the pages of the linked journal the user may read. */
export class NoteViewer extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    classes: ["note-viewer"],
    window: { title: "Nota", frame: true, positioned: true, icon: "fa-solid fa-bookmark", controls: [], minimizable: true, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: 440 },
  };

  constructor(private readonly note: any) {
    super({ id: `note-viewer-${note.document.id}` });
  }

  override get title(): string {
    return this.#entry?.name || "Nota";
  }

  get #entry(): any {
    const entry = this.note.document.entry;
    return entry?.testUserPermission?.(game.user, "LIMITED") ? entry : null;
  }

  buildContent(): Node[] {
    const text = String(this.note.document.text ?? "").trim();
    const entry = this.#entry;
    const content: Node[] = [];
    if (text) content.push(h("p", { class: "note-viewer-text" }, text));
    if (entry) content.push(buildJournalPagesSection(entry, false));
    if (!text && !entry) content.push(h("p", { class: "hint" }, "Esta nota está vazia."));
    const actions: HTMLElement[] = [];
    if (entry) {
      const open = h("button", { type: "button" }, h("i", { class: "fa-solid fa-book-open" }), " Abrir diário");
      open.addEventListener("click", () => entry.sheet?.render(true));
      actions.push(open);
    }
    if (this.note.canDragWithoutControl(game.user)) {
      const edit = h("button", { type: "button" }, h("i", { class: "fa-solid fa-pen" }), " Editar nota");
      edit.addEventListener("click", () => {
        void this.close();
        void canvas.hud?.configureNote?.(this.note);
      });
      actions.push(edit);
    }
    if (actions.length > 0) content.push(h("footer", { class: "form-footer" }, ...actions));
    return content;
  }
}

export function installNoteViewer(): void {
  Hooks.on("activateNote", (note: any) => {
    void new NoteViewer(note).render({ force: true });
    return false;
  });
}
