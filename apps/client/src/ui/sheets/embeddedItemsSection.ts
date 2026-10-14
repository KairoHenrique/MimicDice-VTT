import { h } from "../../views/dom";
import { makeItemDraggable } from "../items/itemExchange";

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
    row.title = "Arraste para outro personagem, para a ficha dele ou para o chão do mapa";
    makeItemDraggable(row, item);
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
  if (editable) section.append(quickAddRow(actor));
  return section;
}

const MAX_ITEM_NAME_LENGTH = 80;

/** Picking up an item only needs its name (a key, a torch...); the full dialog stays one click away. */
function quickAddRow(actor: any): HTMLElement {
  const nameInput = h("input", { type: "text", maxlength: MAX_ITEM_NAME_LENGTH, placeholder: "Nome do item (ex.: Chave de ferro)", "aria-label": "Nome do item" }) as HTMLInputElement;
  const carryButton = h("button", { type: "button", class: "primary" }, h("i", { class: "fa-solid fa-hand-holding" }), " Carregar");
  const detailedButton = h("button", { type: "button", title: "Criar item com tipo, imagem e detalhes" }, h("i", { class: "fa-solid fa-plus" }), " Detalhado");
  const carry = async () => {
    const name = nameInput.value.trim().slice(0, MAX_ITEM_NAME_LENGTH);
    if (!name) return nameInput.focus();
    const itemClass = CONFIG.Item.documentClass;
    const type = itemClass.TYPES.find((candidate: string) => candidate !== "base") ?? itemClass.TYPES[0] ?? "base";
    await actor.createEmbeddedDocuments("Item", [{ name, type }]);
    ui.notifications.info(`${actor.name} agora carrega "${name}".`);
  };
  carryButton.addEventListener("click", () => void carry());
  nameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void carry();
  });
  detailedButton.addEventListener("click", () => void CONFIG.Item.documentClass.createDialog({}, { parent: actor }));
  return h("div", { class: "items-quick-add" }, nameInput, carryButton, detailedButton);
}
