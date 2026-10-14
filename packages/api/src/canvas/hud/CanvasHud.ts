import type * as PIXI from "pixi.js";
import type { PlainObject } from "@tabbletop/common";
import { DialogV2 } from "../../applications/DialogV2";
import { CONST } from "../../constants";
import { currentGame } from "../../runtime";
import type { Token } from "../placeables/Token";
import type { AmbientLight, Note, Wall } from "../placeables/simplePlaceables";
import { buildForm, readForm, type FormFieldSpec } from "./hudForms";

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

  showTokenMenu(token: Token, event: PIXI.FederatedPointerEvent): void {
    const user = currentGame()?.user;
    const entries: MenuEntry[] = [];
    if (token.actor?.testUserPermission?.(user, "LIMITED")) entries.push({ label: "Abrir ficha", icon: "fa-solid fa-id-card", onSelect: () => token.actor.sheet?.render(true) });
    if (user?.isGM) {
      const hidden = token.document.hidden === true;
      entries.push({ label: hidden ? "Revelar aos jogadores" : "Ocultar dos jogadores", icon: hidden ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", onSelect: () => token.document.update({ hidden: !hidden }) });
      entries.push({ label: "Configurar token", icon: "fa-solid fa-gear", onSelect: () => this.configureToken(token) });
    }
    if (token.document.canUserModify?.(user, "delete") && (user?.isGM || user?.can?.("TOKEN_DELETE"))) {
      entries.push({ label: "Remover do mapa", icon: "fa-solid fa-trash", onSelect: () => token.document.delete() });
    }
    this.#openMenu(entries, event);
  }

  showWallMenu(wall: Wall, event: PIXI.FederatedPointerEvent): void {
    if (!currentGame()?.user?.isGM) return;
    const update = (changes: PlainObject) => wall.document.update(changes);
    const locked = Number(wall.document.ds) === CONST.WALL_DOOR_STATES.LOCKED;
    const entries: MenuEntry[] = [
      { label: "Parede comum", icon: "fa-solid fa-grip-lines-vertical", onSelect: () => update({ door: CONST.WALL_DOOR_TYPES.NONE, ds: 0 }) },
      { label: "Porta", icon: "fa-solid fa-door-closed", onSelect: () => update({ door: CONST.WALL_DOOR_TYPES.DOOR }) },
      { label: "Porta secreta", icon: "fa-solid fa-user-secret", onSelect: () => update({ door: CONST.WALL_DOOR_TYPES.SECRET }) },
    ];
    if (wall.isDoor) entries.push({ label: locked ? "Destrancar" : "Trancar", icon: locked ? "fa-solid fa-lock-open" : "fa-solid fa-lock", onSelect: () => update({ ds: locked ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.LOCKED }) });
    entries.push({ label: "Excluir parede", icon: "fa-solid fa-trash", onSelect: () => wall.document.delete() });
    this.#openMenu(entries, event);
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
