import { TextEditor } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DocumentOwnershipConfig } from "../documents/DocumentOwnershipConfig";
import { describeVisibility } from "../documents/ownershipLevels";

const FORBIDDEN_ELEMENTS = "script, style, iframe, object, embed, link, meta, form, base";

/** Second line of defense: strips active content even though the server already sanitized this HTML. */
function stripActiveContent(root: HTMLElement): void {
  for (const element of Array.from(root.querySelectorAll(FORBIDDEN_ELEMENTS))) element.remove();
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const isEventHandler = attribute.name.toLowerCase().startsWith("on");
      const isScriptUrl = ["href", "src", "xlink:href", "action"].includes(attribute.name.toLowerCase()) && /^\s*(javascript|vbscript|data):/i.test(attribute.value);
      if (isEventHandler || isScriptUrl) element.removeAttribute(attribute.name);
    }
  }
}

function renderedContent(html: string | null): HTMLElement {
  const container = h("div", { class: "page-content" });
  const parsed = new DOMParser().parseFromString(html ?? "", "text/html");
  stripActiveContent(parsed.body);
  container.append(...Array.from(parsed.body.childNodes));
  return container;
}

function pageView(page: any, editable: boolean): HTMLElement {
  const article = h("article", { class: "journal-page", "data-page-id": page.id });
  const header = h("header", { class: "page-header" });
  if (editable) {
    const nameInput = h("input", { type: "text", value: page.name, "aria-label": "Título da página", class: "page-name" });
    nameInput.addEventListener("change", (event) => {
      event.stopPropagation();
      void page.update({ name: nameInput.value });
    });
    header.append(nameInput);
  } else {
    header.append(h("h3", {}, page.name));
  }
  if (game.user.isGM) {
    const visibility = describeVisibility(page._source.ownership?.default === -1 ? undefined : page._source.ownership);
    const label = page._source.ownership?.default === -1 ? "Igual ao diário" : visibility.label;
    const button = h("button", { type: "button", class: "icon", title: `Visibilidade: ${label}` }, h("i", { class: page._source.ownership?.default === -1 ? "fa-solid fa-arrow-turn-up" : visibility.icon }));
    button.addEventListener("click", () => void new DocumentOwnershipConfig(page).render({ force: true }));
    header.append(button);
  }
  if (editable) {
    const remove = h("button", { type: "button", class: "icon", title: "Excluir página" }, h("i", { class: "fa-solid fa-trash" }));
    remove.addEventListener("click", () => void page.deleteDialog());
    header.append(remove);
  }
  article.append(header);
  const body = h("div", { class: "page-body" });
  article.append(body);
  void showPageContent(page, body, editable);
  return article;
}

async function showPageContent(page: any, body: HTMLElement, editable: boolean): Promise<void> {
  const enriched = await TextEditor.implementation.enrichHTML(page.text?.content ?? "", { secrets: page.isOwner, relativeTo: page });
  const content = renderedContent(enriched || (editable ? "" : "<p></p>"));
  body.replaceChildren(content);
  if (!editable) return;
  if (!enriched) content.append(h("p", { class: "hint" }, "Página vazia. Clique em Editar para escrever."));
  const editButton = h("button", { type: "button", class: "page-edit" }, h("i", { class: "fa-solid fa-pen" }), " Editar");
  editButton.addEventListener("click", () => void openPageEditor(page, body));
  body.append(editButton);
}

async function openPageEditor(page: any, body: HTMLElement): Promise<void> {
  const host = h("div", { class: "page-editor" });
  body.replaceChildren(host);
  await TextEditor.implementation.create(
    {
      target: host,
      height: 180,
      onSave: (html: string) => page.update({ "text.content": html }),
      onCancel: () => void showPageContent(page, body, true),
    },
    page.text?.content ?? "",
  );
}

export function buildJournalPagesSection(entry: any, editable: boolean): HTMLElement {
  const pages = Array.from(entry.pages?.values() ?? []) as any[];
  pages.sort((left, right) => (left.sort ?? 0) - (right.sort ?? 0));
  const section = h("section", { class: "journal-pages" }, ...pages.map((page) => pageView(page, editable)));
  if (pages.length === 0) section.append(h("p", { class: "hint" }, "Nenhuma página."));
  if (editable) {
    const addButton = h("button", { type: "button" }, h("i", { class: "fa-solid fa-plus" }), " Nova página");
    addButton.addEventListener("click", () => {
      void CONFIG.JournalEntryPage.documentClass.create({ name: `Página ${pages.length + 1}`, type: "text", text: { content: "" } }, { parent: entry });
    });
    section.append(addButton);
  }
  return section;
}
