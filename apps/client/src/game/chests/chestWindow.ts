import { DialogV2, FilePicker } from "@tabbletop/api";
import { isChestFull, MAX_CHEST_ENTRIES, MAX_PERCEPTION, visibleChestEntries, type Chest, type ChestEntry } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { characterPerceptionOf } from "../concealment/perception";
import { addItemAsGameMaster, chestOf, ownTokensInReach, putInChest, saveChestAsGameMaster, takeFromChest } from "./chestActions";

const DEFAULT_ITEM_ICON = "icons/svg/item-bag.svg";

function itemLabel(entry: ChestEntry): HTMLElement {
  return h("span", { class: "md-chest-item" }, h("img", { src: entry.item.img || DEFAULT_ITEM_ICON, alt: "", class: "md-chest-thumb" }), h("span", { class: "md-chest-name", title: entry.item.name }, entry.item.name));
}

function button(label: string, icon: string, onClick: () => unknown, title = label): HTMLButtonElement {
  const element = h("button", { type: "button", title, "aria-label": title }, h("i", { class: icon, "aria-hidden": "true" }), label ? ` ${label}` : "");
  element.addEventListener("click", () => void onClick());
  return element;
}

function gameMasterRow(tile: any, chest: Chest, entry: ChestEntry): HTMLElement {
  const dc = h("input", { type: "number", min: 0, max: MAX_PERCEPTION, step: 1, value: entry.perceptionDc === null ? "" : String(entry.perceptionDc), placeholder: "DT", class: "md-chest-dc", "aria-label": `DT de percepção de ${entry.item.name}`, title: "DT de percepção: só quem alcançar vê o item. Vazio: todos veem." });
  dc.addEventListener("change", () => {
    const value = Math.round(Number(dc.value));
    const perceptionDc = dc.value.trim() === "" || !Number.isFinite(value) || value <= 0 ? null : Math.min(value, MAX_PERCEPTION);
    void saveChestAsGameMaster(tile, { ...chest, entries: chest.entries.map((candidate) => (candidate.id === entry.id ? { ...candidate, perceptionDc } : candidate)) });
  });
  const reveal = button("", entry.revealed ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", () => saveChestAsGameMaster(tile, { ...chest, entries: chest.entries.map((candidate) => (candidate.id === entry.id ? { ...candidate, revealed: !entry.revealed } : candidate)) }), entry.revealed ? `${entry.item.name} está revelado para todos. Clique para voltar a usar a DT.` : `Revelar ${entry.item.name} para todos, ignorando a DT`);
  reveal.classList.toggle("active", entry.revealed);
  reveal.setAttribute("aria-pressed", String(entry.revealed));
  dc.disabled = entry.revealed;
  const remove = button("", "fa-solid fa-trash", () => saveChestAsGameMaster(tile, { ...chest, entries: chest.entries.filter((candidate) => candidate.id !== entry.id) }), `Tirar ${entry.item.name} do baú`);
  return h("li", { class: "md-chest-row" }, itemLabel(entry), h("label", { class: "md-chest-dc-field" }, "DT", dc), reveal, remove);
}

function fillText(chest: Chest): string {
  return chest.capacity === null ? `${chest.entries.length} item(ns), sem limite` : `${chest.entries.length} de ${chest.capacity} itens`;
}

function pickImage(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const picker = new FilePicker.implementation({ type: "image", current, callback: (path: string) => resolve(path) });
    void picker.render({ force: true });
  });
}

/** The chest's picture on the map and how many items it holds. */
function chestSettings(tile: any, chest: Chest): HTMLElement {
  const imagePath = String(tile.document.texture?.src ?? "");
  const change = button("Trocar imagem", "fa-solid fa-image", async () => {
    const path = await pickImage(imagePath);
    if (path) await tile.document.update({ "texture.src": path });
  });
  const capacity = h("input", { type: "number", min: 1, max: MAX_CHEST_ENTRIES, step: 1, value: chest.capacity === null ? "" : String(chest.capacity), placeholder: "Sem limite", class: "md-chest-capacity", "aria-label": "Capacidade do baú (máximo de itens)" });
  capacity.addEventListener("change", () => {
    const value = Math.round(Number(capacity.value));
    const next = capacity.value.trim() === "" || !Number.isFinite(value) || value <= 0 ? null : Math.min(value, MAX_CHEST_ENTRIES);
    if (next !== null && next < chest.entries.length) ui.notifications.info("O baú já tem mais itens que isso. Ninguém consegue guardar até sobrar espaço.");
    void saveChestAsGameMaster(tile, { ...chest, capacity: next });
  });
  return h(
    "div",
    { class: "md-chest-settings" },
    h("img", { src: imagePath || DEFAULT_ITEM_ICON, alt: "", class: "md-chest-preview" }),
    h("div", { class: "md-chest-settings-fields" }, change, h("label", { class: "md-chest-capacity-field" }, "Capacidade", capacity), h("span", { class: "hint" }, fillText(chest))),
  );
}

function gameMasterView(tile: any, chest: Chest): HTMLElement[] {
  const name = h("input", { type: "text", maxLength: 60, value: chest.name, "aria-label": "Nome do baú" });
  name.addEventListener("change", () => void saveChestAsGameMaster(tile, { ...chest, name: name.value.trim() || chest.name }));
  const worldItems = (game.items?.contents ?? []) as any[];
  const picker = h("select", { "aria-label": "Item para guardar" }, ...worldItems.map((item) => h("option", { value: item.id }, item.name)));
  const add = button("Guardar", "fa-solid fa-plus", () => {
    const item = game.items.get(picker.value);
    return item ? addItemAsGameMaster(tile, item) : undefined;
  });
  add.disabled = isChestFull(chest);
  const rows = chest.entries.map((entry) => gameMasterRow(tile, chest, entry));
  return [
    h("label", { class: "md-chest-title" }, "Nome", name),
    chestSettings(tile, chest),
    rows.length ? h("ul", { class: "md-chest-list" }, ...rows) : h("p", { class: "hint" }, "Baú vazio."),
    worldItems.length ? h("div", { class: "md-chest-add" }, picker, add) : h("p", { class: "hint" }, "Crie itens na aba Itens para guardar aqui."),
    h("p", { class: "hint" }, "Também dá para arrastar itens da aba Itens ou de um inventário até o baú no mapa. A DT de cada item esconde ele de quem não passou no teste de percepção; o olho revela o item para todos."),
  ];
}

function playerView(tile: any, actors: any[], chosen: { actor: any }, rerender: () => void): HTMLElement[] {
  if (actors.length === 0) return [h("p", { class: "hint" }, "Chegue mais perto do baú com seu personagem.")];
  const picker = h("select", { "aria-label": "Personagem que usa o baú" }, ...actors.map((actor) => h("option", { value: actor.id, selected: actor === chosen.actor }, actor.name)));
  picker.addEventListener("change", () => {
    chosen.actor = actors.find((actor) => actor.id === picker.value) ?? chosen.actor;
    rerender();
  });
  const entries = visibleChestEntries(tile.document._source, characterPerceptionOf(tile.document, chosen.actor.id));
  const rows = entries.map((entry) => h("li", { class: "md-chest-row" }, itemLabel(entry), button("Pegar", "fa-solid fa-hand-holding", () => takeFromChest(tile, entry.id, chosen.actor))));
  const carried = Array.from(chosen.actor.items?.values?.() ?? []) as any[];
  const storePicker = h("select", { "aria-label": "Item para guardar" }, ...carried.map((item) => h("option", { value: item.id }, item.name)));
  const store = button("Guardar", "fa-solid fa-box-archive", () => {
    const item = chosen.actor.items.get(storePicker.value);
    return item ? putInChest(tile, item) : undefined;
  });
  const chest = chestOf(tile);
  const full = chest !== null && isChestFull(chest);
  store.disabled = full;
  const view: HTMLElement[] = [
    actors.length > 1 ? h("label", { class: "md-chest-title" }, "Personagem", picker) : h("p", { class: "hint" }, `Usando: ${chosen.actor.name}`),
    rows.length ? h("ul", { class: "md-chest-list" }, ...rows) : h("p", { class: "hint" }, "Você não encontrou nada aqui."),
  ];
  if (carried.length) view.push(h("div", { class: "md-chest-add" }, storePicker, store));
  if (full) view.push(h("p", { class: "hint" }, "O baú está cheio."));
  return view;
}

/** Lists what is in the chest (for players, only what their character noticed) and keeps up with changes while open. */
export async function openChestWindow(tile: any): Promise<void> {
  const chest = chestOf(tile);
  if (!chest) return;
  const body = h("div", { class: "md-chest" });
  const actors = game.user.isGM ? [] : ownTokensInReach(tile).map((token) => token.actor);
  const chosen = { actor: actors[0] ?? null };
  const render = () => {
    const current = chestOf(tile);
    if (!current || tile.destroyed) return body.replaceChildren(h("p", { class: "hint" }, "Este baú não existe mais."));
    body.replaceChildren(...(game.user.isGM ? gameMasterView(tile, current) : playerView(tile, actors, chosen, render)));
  };
  render();
  const refresh = (changed: any) => {
    if (body.isConnected && (changed?.id === tile.id || changed?.parent?.id === chosen.actor?.id)) render();
  };
  const hooks = ["updateTile", "createItem", "deleteItem"].map((hook) => [hook, Hooks.on(hook, refresh)] as const);
  await DialogV2.prompt({ window: { title: chest.name }, position: { width: 420 } as any, content: body, ok: { label: "Fechar", icon: "fa-solid fa-check" } });
  for (const [hook, id] of hooks) Hooks.off(hook, id);
}
