import { h } from "../../views/dom";

function itemRow(item: any, editable: boolean): HTMLElement {
  const row = h(
    "li",
    { class: "embedded-item", "data-item-id": item.id },
    h("img", { class: "thumbnail", src: item.img ?? "icons/svg/item-bag.svg", alt: "" }),
    h("span", { class: "entry-name" }, item.name),
    h("span", { class: "hint" }, item.type),
  );
  const open = h("button", { type: "button", class: "icon", title: "Abrir" }, h("i", { class: "fa-solid fa-pen-to-square" }));
  open.addEventListener("click", () => void item.sheet?.render(true));
  row.append(open);
  if (editable) {
    const remove = h("button", { type: "button", class: "icon", title: "Excluir" }, h("i", { class: "fa-solid fa-trash" }));
    remove.addEventListener("click", () => void item.deleteDialog());
    row.append(remove);
  }
  return row;
}

/** Inventory of items owned by an actor; created items live inside the actor, so the actor's owner manages them. */
export function buildEmbeddedItemsSection(actor: any, editable: boolean): HTMLElement {
  const items = Array.from(actor.items?.values() ?? []) as any[];
  items.sort((left, right) => (left.sort ?? 0) - (right.sort ?? 0) || String(left.name).localeCompare(String(right.name), "pt-BR"));
  const list = h("ol", { class: "embedded-list" }, ...items.map((item) => itemRow(item, editable)));
  if (items.length === 0) list.append(h("li", { class: "hint" }, "Nenhum item."));
  const section = h("fieldset", { class: "items-section" }, h("legend", {}, "Itens"), list);
  if (editable) {
    const addButton = h("button", { type: "button" }, h("i", { class: "fa-solid fa-plus" }), " Adicionar item");
    addButton.addEventListener("click", () => void CONFIG.Item.documentClass.createDialog({}, { parent: actor }));
    section.append(addButton);
  }
  return section;
}
