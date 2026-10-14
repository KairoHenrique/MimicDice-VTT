import type * as PIXI from "pixi.js";
import { DOOR_KEY_FLAG, DOOR_KEY_FLAG_SCOPE, MAX_DOOR_KEY_NAME_LENGTH, type PlainObject } from "@tabbletop/common";
import { DialogV2 } from "../../applications/DialogV2";
import { CONST } from "../../constants";
import { currentConfig, currentGame, currentUi } from "../../runtime";
import type { Token } from "../placeables/Token";
import type { AmbientLight, Note, Tile, Wall } from "../placeables/simplePlaceables";
import { buildForm, readForm, type FormFieldSpec } from "./hudForms";

const MAX_ITEM_SUGGESTIONS = 200;

/** Item names from the Items directory and from every character's inventory, for the door key picker. */
function knownItemNames(): string[] {
  const game = currentGame();
  const names = new Set<string>();
  const addName = (name: unknown) => {
    if (typeof name === "string" && name.trim()) names.add(name.trim());
  };
  for (const item of game?.items?.contents ?? []) addName(item.name);
  for (const actor of game?.actors?.contents ?? []) for (const item of actor.items?.values?.() ?? []) addName(item.name);
  return Array.from(names).sort((left, right) => left.localeCompare(right, "pt-BR")).slice(0, MAX_ITEM_SUGGESTIONS);
}

interface MenuEntry {
  label: string;
  icon: string;
  onSelect: () => unknown;
}

const MAX_TEXT_LENGTH = 2000;

/** Context menus and small configuration dialogs for placeables (DOM only; user text is never parsed as HTML). */
export class CanvasHud {
  #menu: HTMLElement | null = null;
  #closeMenu = (event: Event) => {
    if (this.#menu && event.target instanceof Node && this.#menu.contains(event.target)) return;
    this.closeMenu();
  };

  closeMenu(): void {
    this.#menu?.remove();
    this.#menu = null;
    document.removeEventListener("pointerdown", this.#closeMenu, true);
  }

  /** Menus are positioned once at the pointer and closed on pan, so there is nothing to realign. */
  align(): void {}

  #moveConfirmation: { element: HTMLElement; settle: (confirmed: boolean) => void } | null = null;

  /** Asks whether to walk the previewed path; Enter confirms, Escape cancels. Resolves false if replaced. */
  confirmMove(client: { x: number; y: number }, summary: string): Promise<boolean> {
    this.cancelMoveConfirmation();
    return new Promise<boolean>((resolve) => {
      const element = document.createElement("div");
      element.className = "canvas-move-confirm";
      element.setAttribute("role", "dialog");
      const text = document.createElement("span");
      text.textContent = summary;
      const confirm = this.#confirmButton("Mover", "fa-solid fa-person-walking", "primary");
      const cancel = this.#confirmButton("Cancelar", "fa-solid fa-xmark", "");
      element.append(text, confirm, cancel);
      element.style.left = `${Math.round(client.x)}px`;
      element.style.top = `${Math.round(client.y)}px`;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Enter") settle(true);
        else if (event.key === "Escape") settle(false);
        else return;
        event.preventDefault();
        event.stopPropagation();
      };
      const settle = (confirmed: boolean) => {
        window.removeEventListener("keydown", onKey, true);
        element.remove();
        if (this.#moveConfirmation?.element === element) this.#moveConfirmation = null;
        resolve(confirmed);
      };
      confirm.addEventListener("click", () => settle(true));
      cancel.addEventListener("click", () => settle(false));
      window.addEventListener("keydown", onKey, true);
      document.body.append(element);
      this.#moveConfirmation = { element, settle };
      confirm.focus();
    });
  }

  cancelMoveConfirmation(): void {
    this.#moveConfirmation?.settle(false);
  }

  #confirmButton(label: string, icon: string, className: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    if (className) button.className = className;
    const glyph = document.createElement("i");
    glyph.className = icon;
    button.append(glyph, document.createTextNode(` ${label}`));
    return button;
  }

  showTokenMenu(token: Token, event: PIXI.FederatedPointerEvent): void {
    const user = currentGame()?.user;
    const entries: MenuEntry[] = [];
    if (token.actor?.testUserPermission?.(user, "LIMITED")) entries.push({ label: "Abrir ficha", icon: "fa-solid fa-id-card", onSelect: () => token.actor.sheet?.render(true) });
    if (user?.isGM) {
      const hidden = token.document.hidden === true;
      entries.push({ label: hidden ? "Revelar aos jogadores" : "Ocultar dos jogadores", icon: hidden ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", onSelect: () => token.document.update({ hidden: !hidden }) });
      entries.push(this.#combatEntry(token));
      entries.push(this.#pinEntry(token.document));
      entries.push({ label: "Configurar token", icon: "fa-solid fa-gear", onSelect: () => this.configureToken(token) });
    }
    if (token.document.canUserModify?.(user, "delete") && (user?.isGM || user?.can?.("TOKEN_DELETE"))) {
      entries.push({ label: "Remover do mapa", icon: "fa-solid fa-trash", onSelect: () => token.document.delete() });
    }
    this.#openMenu(entries, event);
  }

  showTileMenu(tile: Tile, event: PIXI.FederatedPointerEvent): void {
    if (!currentGame()?.user?.isGM) return;
    this.#openMenu([this.#pinEntry(tile.document), { label: "Excluir tile", icon: "fa-solid fa-trash", onSelect: () => tile.document.delete() }], event);
  }

  showWallMenu(wall: Wall, event: PIXI.FederatedPointerEvent): void {
    if (!currentGame()?.user?.isGM) return;
    const update = (changes: PlainObject) => wall.document.update(changes);
    const entries: MenuEntry[] = wall.isDoor
      ? [
          { label: wall.isLocked ? "Destrancar" : "Trancar", icon: wall.isLocked ? "fa-solid fa-lock-open" : "fa-solid fa-lock", onSelect: () => update({ ds: wall.isLocked ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.LOCKED }) },
          { label: wall.requiredItem ? `Chave: ${wall.requiredItem}` : "Exigir item para abrir", icon: "fa-solid fa-key", onSelect: () => this.configureDoorKey(wall) },
          { label: "Virar parede comum", icon: "fa-solid fa-grip-lines-vertical", onSelect: () => update({ door: CONST.WALL_DOOR_TYPES.NONE, ds: CONST.WALL_DOOR_STATES.CLOSED }) },
        ]
      : [{ label: "Virar porta", icon: "fa-solid fa-door-closed", onSelect: () => update({ door: CONST.WALL_DOOR_TYPES.DOOR, ds: CONST.WALL_DOOR_STATES.CLOSED }) }];
    entries.push({ label: wall.isDoor ? "Excluir porta" : "Excluir parede", icon: "fa-solid fa-trash", onSelect: () => wall.document.delete() });
    this.#openMenu(entries, event);
  }

  /** Links a door to an item by name: any character carrying an item with that name may open it. */
  async configureDoorKey(wall: Wall): Promise<void> {
    if (!currentGame()?.user?.isGM) return;
    const values = await this.#formDialog("Item que abre a porta", [
      { name: "requiredItem", label: "Nome do item (vazio = qualquer um abre)", type: "text", value: wall.requiredItem ?? "", maxLength: MAX_DOOR_KEY_NAME_LENGTH, suggestions: knownItemNames() },
    ]);
    if (!values) return;
    const requiredItem = typeof values.requiredItem === "string" ? values.requiredItem.trim() : "";
    await wall.document.update({ [`flags.${DOOR_KEY_FLAG_SCOPE}.${DOOR_KEY_FLAG}`]: requiredItem });
    currentUi()?.notifications?.info(requiredItem ? `Só abre quem carregar "${requiredItem}".` : "Qualquer jogador pode abrir esta porta.");
  }

  /** GM-only: adds the token to the viewed encounter (creating one for this scene if needed) or takes it out. */
  #combatEntry(token: Token): MenuEntry {
    const combat = currentGame()?.combats?.viewed ?? null;
    const combatant = combat?.combatants?.find((candidate: any) => candidate.tokenId === token.id) ?? null;
    if (combatant) return { label: "Sair do combate", icon: "fa-solid fa-person-walking-arrow-right", onSelect: () => combatant.delete() };
    return {
      label: "Entrar em combate",
      icon: "fa-solid fa-hand-fist",
      onSelect: async () => {
        const sceneId = token.document.parent?.id ?? null;
        const encounter = combat ?? (await currentConfig().Combat.documentClass.create({ scene: sceneId, active: true, round: 0, turn: null, started: false }));
        if (!encounter) return;
        await encounter.createEmbeddedDocuments("Combatant", [
          { tokenId: token.id, sceneId, actorId: token.document.actorId ?? null, name: String(token.document.name ?? "Token"), img: token.document.texture?.src ?? null, hidden: token.document.hidden === true },
        ]);
      },
    };
  }

  /** GM-only: a pinned object cannot be dragged by anyone until the GM unpins it. */
  #pinEntry(document: any): MenuEntry {
    const pinned = document.locked === true;
    return {
      label: pinned ? "Destravar posição" : "Travar posição",
      icon: pinned ? "fa-solid fa-unlock" : "fa-solid fa-thumbtack",
      onSelect: async () => {
        await document.update({ locked: !pinned });
        currentUi()?.notifications?.info(pinned ? "Objeto liberado para mover." : "Objeto travado no lugar.");
      },
    };
  }

  async configureToken(token: Token): Promise<void> {
    const document = token.document;
    const fields: FormFieldSpec[] = [
      { name: "name", label: "Nome", type: "text", value: document.name ?? "" },
      { name: "texture.src", label: "Imagem do token", type: "image", value: document.texture?.src ?? "", maxLength: 2048 },
      { name: "width", label: "Largura (quadrados)", type: "number", value: document.width, min: 0.25, max: 20, step: 0.25 },
      { name: "height", label: "Altura (quadrados)", type: "number", value: document.height, min: 0.25, max: 20, step: 0.25 },
      { name: "sight.enabled", label: "Tem visão", type: "checkbox", value: document.sight?.enabled === true },
      { name: "sight.range", label: `Alcance da visão (${currentGame()?.canvas?.dimensions?.units ?? ""}; 0 = ilimitado)`, type: "number", value: document.sight?.range ?? 0, min: 0, max: 1000 },
      { name: "displayName", label: "Mostrar nome sempre", type: "checkbox", value: Number(document.displayName) >= CONST.TOKEN_DISPLAY_MODES.ALWAYS },
    ];
    const values = await this.#formDialog("Configurar token", fields);
    if (!values) return;
    const showName = values.displayName === true;
    await document.update({ ...values, displayName: showName ? CONST.TOKEN_DISPLAY_MODES.ALWAYS : CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER });
  }

  async configureLight(light: AmbientLight): Promise<void> {
    if (!currentGame()?.user?.isGM) return;
    const config = light.document.config ?? {};
    const values = await this.#formDialog("Configurar luz", [
      { name: "config.dim", label: "Luz fraca (raio)", type: "number", value: config.dim ?? 0, min: 0, max: 500 },
      { name: "config.bright", label: "Luz forte (raio)", type: "number", value: config.bright ?? 0, min: 0, max: 500 },
      { name: "config.color", label: "Cor", type: "color", value: config.color ?? "#ffd27a" },
      { name: "config.alpha", label: "Intensidade (0 a 1)", type: "number", value: config.alpha ?? 0.5, min: 0, max: 1, step: 0.05 },
      { name: "walls", label: "Bloqueada por paredes", type: "checkbox", value: light.document.walls !== false },
      { name: "hidden", label: "Desligada", type: "checkbox", value: light.document.hidden === true },
    ]);
    if (values) await light.document.update(values);
  }

  async configureNote(note: Note | null, _event?: unknown, initial: PlainObject = {}): Promise<PlainObject | null> {
    const source = note?.document ?? initial;
    const journalChoices = (currentGame()?.journal?.contents ?? []).map((entry: any) => ({ value: entry.id, label: entry.name }));
    const values = await this.#formDialog(note ? "Editar nota" : "Nova nota", [
      { name: "text", label: "Texto", type: "text", value: source.text ?? "", maxLength: 200 },
      { name: "entryId", label: "Diário vinculado", type: "select", value: source.entryId ?? "", choices: [{ value: "", label: "(nenhum)" }, ...journalChoices] },
      { name: "global", label: "Visível em qualquer camada", type: "checkbox", value: source.global === true },
    ]);
    if (!values) return null;
    const prepared = { ...values, entryId: values.entryId || null };
    if (note) await note.document.update(prepared);
    return prepared;
  }

  /** Asks for whatever a freshly drawn object still needs; returns null when the user cancels. */
  async prepareCreation(documentName: string, data: PlainObject): Promise<PlainObject | null> {
    if (documentName === "Note") {
      const values = await this.configureNote(null, undefined, data);
      return values ? { ...data, ...values } : null;
    }
    if (documentName === "Tile") {
      const values = await this.#formDialog("Novo tile", [{ name: "texture.src", label: "Imagem do tile", type: "image", value: "", maxLength: 2048 }]);
      const source = (values?.texture as PlainObject | undefined)?.src;
      return typeof source === "string" && source.trim() ? { ...data, texture: { src: source.trim() } } : null;
    }
    if (documentName === "Drawing" && (data.shape as PlainObject | undefined)?.type === CONST.DRAWING_TYPES.TEXT) {
      const values = await this.#formDialog("Texto no mapa", [{ name: "text", label: "Texto", type: "text", value: "", maxLength: MAX_TEXT_LENGTH }]);
      return typeof values?.text === "string" && values.text.trim() ? { ...data, text: values.text.trim() } : null;
    }
    return data;
  }

  async #formDialog(title: string, fields: FormFieldSpec[]): Promise<PlainObject | null> {
    const form = buildForm(fields);
    const result = await DialogV2.wait({
      window: { title },
      content: form,
      buttons: [
        { action: "save", label: "Salvar", icon: "fa-solid fa-check", default: true, callback: () => readForm(form, fields) },
        { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => null },
      ],
    });
    return result && typeof result === "object" ? (result as PlainObject) : null;
  }

  #openMenu(entries: MenuEntry[], event: PIXI.FederatedPointerEvent): void {
    this.closeMenu();
    if (entries.length === 0) return;
    const menu = document.createElement("nav");
    menu.className = "canvas-context-menu";
    menu.setAttribute("role", "menu");
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      const icon = document.createElement("i");
      icon.className = entry.icon;
      button.append(icon, document.createTextNode(` ${entry.label}`));
      button.addEventListener("click", () => {
        this.closeMenu();
        void entry.onSelect();
      });
      menu.append(button);
    }
    menu.style.left = `${Math.round(event.clientX)}px`;
    menu.style.top = `${Math.round(event.clientY)}px`;
    document.body.append(menu);
    this.#menu = menu;
    setTimeout(() => document.addEventListener("pointerdown", this.#closeMenu, true), 0);
  }
}
