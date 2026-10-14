import * as PIXI from "pixi.js";
import type { PlainObject } from "@tabbletop/common";
import { MAP_LOCKED_SETTING_KEY, SCENE_PAUSED_SETTING_KEY, TABLE_SESSION_OPEN_SETTING_KEY } from "@tabbletop/protocol";
import { seesEverything } from "../perception/viewpoint";
import { Hooks } from "../../hooks/Hooks";
import { currentCanvas, currentGame } from "../../runtime";
import type { Point, Rectangle } from "../geometry";

const DOUBLE_CLICK_MS = 350;

function isWorldFlagOn(settingKey: string): boolean {
  const [namespace, key] = settingKey.split(".");
  try {
    return currentGame()?.settings.get(namespace, key) === true;
  } catch {
    return false;
  }
}

function isTableSessionClosed(): boolean {
  const [namespace, key] = TABLE_SESSION_OPEN_SETTING_KEY.split(".");
  try {
    return currentGame()?.settings.get(namespace, key) !== true;
  } catch {
    return false;
  }
}

function isFrozenByGameMaster(user: any): boolean {
  if (!user || user.isGM) return false;
  return isWorldFlagOn(MAP_LOCKED_SETTING_KEY) || isWorldFlagOn(SCENE_PAUSED_SETTING_KEY) || isTableSessionClosed();
}

/**
 * Display object for one embedded scene document. Subclasses implement `_draw` (build children, may load textures)
 * and `_refresh` (cheap state sync). Hook names follow Foundry: drawX, refreshX, controlX, hoverX, destroyX.
 */
export abstract class PlaceableObject extends PIXI.Container {
  static embeddedName = "";
  static RENDER_FLAGS: Record<string, unknown> = {};

  readonly document: any;
  controlled = false;
  hover = false;
  #lastClickTime = 0;
  #drawGeneration = 0;

  constructor(document: any) {
    super();
    this.document = document;
    document._object = this;
    this.eventMode = "static";
    this.on("pointerdown", (event: PIXI.FederatedPointerEvent) => this.#onPointerDown(event));
    this.on("pointerover", () => this.#setHover(true));
    this.on("pointerout", () => this.#setHover(false));
  }

  get id(): string {
    return this.document.id;
  }

  get objectId(): string {
    return this.document.id;
  }

  get sourceId(): string {
    return `${this.document.documentName}.${this.document.id}`;
  }

  get scene(): any {
    return this.document.parent;
  }

  get layer(): any {
    return this.document.layer;
  }

  get isOwner(): boolean {
    return this.document.isOwner;
  }

  get isPreview(): boolean {
    return false;
  }

  get bounds(): Rectangle {
    return { x: this.document.x, y: this.document.y, width: 0, height: 0 };
  }

  get center(): Point {
    const bounds = this.bounds;
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  get isVisible(): boolean {
    return !this.document.hidden || seesEverything();
  }

  /** Rebuilds every child. Concurrent draws are resolved by generation so a stale texture load never wins. */
  async draw(): Promise<this> {
    const generation = ++this.#drawGeneration;
    for (const child of this.removeChildren()) child.destroy({ children: true });
    await this._draw();
    if (generation !== this.#drawGeneration || this.destroyed) return this;
    this.refresh();
    Hooks.callAll(`draw${this.document.documentName}`, this);
    return this;
  }

  refresh(flags: Record<string, boolean> = { refreshState: true }): this {
    if (this.destroyed) return this;
    this._applyRenderFlags(flags);
    this.visible = this.isVisible;
    Hooks.callAll(`refresh${this.document.documentName}`, this, flags);
    return this;
  }

  /** Single entry point for redraw work so packages can wrap it; every flag currently triggers a full refresh. */
  _applyRenderFlags(_flags: Record<string, boolean>): void {
    this._refresh();
  }

  renderFlags = { set: (flags: Record<string, boolean>) => this.refresh(flags) };

  protected abstract _draw(): Promise<void>;
  protected abstract _refresh(): void;

  /** Keys whose change requires rebuilding children instead of a refresh. */
  protected redrawKeys(): string[] {
    return ["texture", "width", "height", "shape"];
  }

  _onUpdate(changed: PlainObject, _options: PlainObject, _userId: string): void {
    if (this.redrawKeys().some((key) => key in changed)) void this.draw();
    else this.refresh();
    currentCanvas()?.perception?.update?.();
  }

  _onDelete(_options: PlainObject, _userId: string): void {
    if (this.controlled) this.release();
    this.layer?.objects?.removeChild?.(this);
    Hooks.callAll(`destroy${this.document.documentName}`, this);
    this.document._object = null;
    this.destroy({ children: true });
    currentCanvas()?.perception?.update?.();
  }

  canControl(user: any = currentGame()?.user): boolean {
    if (!this.layer?.active) return false;
    return Boolean(user?.isGM) || this.document.testUserPermission?.(user, "OWNER") === true;
  }

  canDrag(user: any = currentGame()?.user): boolean {
    const reachable = Boolean(this.layer?.active) || this.answersOnEveryLayer;
    const mayMove = this.canControl(user) || (reachable && this.canDragWithoutControl(user));
    return mayMove && !this.document.locked && !isFrozenByGameMaster(user);
  }

  /** Objects that take clicks and drags while another layer is active (their layer keeps its children interactive). */
  get answersOnEveryLayer(): boolean {
    return false;
  }

  /** Objects a user may drag around without controlling them (no selection, vision or sheet). */
  canDragWithoutControl(_user: any): boolean {
    return false;
  }

  control({ releaseOthers = true }: { releaseOthers?: boolean } = {}): boolean {
    if (!this.canControl()) return false;
    if (releaseOthers) this.layer.releaseAll({ except: this });
    if (this.controlled) return true;
    this.controlled = true;
    this.layer.controlledObjects.set(this.id, this);
    this.refresh();
    currentCanvas()?.perception?.update?.();
    Hooks.callAll(`control${this.document.documentName}`, this, true);
    return true;
  }

  release(): boolean {
    if (!this.controlled) return true;
    this.controlled = false;
    this.layer?.controlledObjects?.delete(this.id);
    this.refresh();
    currentCanvas()?.perception?.update?.();
    Hooks.callAll(`control${this.document.documentName}`, this, false);
    return true;
  }

  /** Document changes that move this object by a canvas-space offset. */
  getMoveUpdate(deltaX: number, deltaY: number, snap: boolean): PlainObject {
    let destination = { x: this.document.x + deltaX, y: this.document.y + deltaY };
    if (snap) destination = currentCanvas().grid.getSnappedPoint(destination, { mode: this.snapMode });
    return { _id: this.id, x: Math.round(destination.x), y: Math.round(destination.y) };
  }

  get snapMode(): "corner" | "center" | "half" {
    return "corner";
  }

  /** Visual-only offset while dragging; the next refresh restores the document position. */
  previewOffset(deltaX: number, deltaY: number): void {
    this.position.set(this.document.x + deltaX, this.document.y + deltaY);
  }

  _onClickLeft2(_event?: PIXI.FederatedPointerEvent): void {
    this.document.sheet?.render(true);
  }

  _onClickRight(_event: PIXI.FederatedPointerEvent): void {}

  #setHover(hovered: boolean): void {
    if (this.destroyed || this.hover === hovered) return;
    this.hover = hovered;
    this.refresh();
    Hooks.callAll(`hover${this.document.documentName}`, this, hovered);
  }

  #onPointerDown(event: PIXI.FederatedPointerEvent): void {
    if (!this.layer?.active && !this.answersOnEveryLayer) return;
    if (event.button === 2) {
      event.stopPropagation();
      this._onClickRight(event);
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    const now = performance.now();
    const isDoubleClick = now - this.#lastClickTime < DOUBLE_CLICK_MS;
    this.#lastClickTime = now;
    if (isDoubleClick) {
      this._onClickLeft2(event);
      return;
    }
    if (!this.controlled && !this.control({ releaseOthers: !event.shiftKey }) && !this.canDrag()) return;
    if (this.canDrag()) currentCanvas()?.interaction?.beginObjectDrag(this, event);
  }
}
