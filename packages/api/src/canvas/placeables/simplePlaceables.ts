import * as PIXI from "pixi.js";
import { itemNamesMatch, requiredDoorItem, type PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import { currentCanvas, currentGame, currentUi } from "../../runtime";
import type { Point, Rectangle, Segment } from "../geometry";
import { colorToNumber, loadTexture } from "../textures";
import { seesEverything } from "../perception/viewpoint";
import { DoorControl } from "./DoorControl";
import { PlaceableObject } from "./PlaceableObject";

/** Whether any character the current user owns carries an item with this name. */
function userCarriesItem(itemName: string): boolean {
  const actors: any[] = currentGame()?.actors?.contents ?? [];
  return actors.some((actor) => actor.isOwner && Array.from((actor.items?.values?.() ?? []) as Iterable<any>).some((item) => itemNamesMatch(item.name, itemName)));
}

const labelStyle = (fontSize: number, fill = 0xffffff) =>
  new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize, fill, stroke: 0x111111, strokeThickness: 4, align: "center" });

export class Tile extends PlaceableObject {
  static override embeddedName = "Tile";
  mesh: PIXI.Sprite | null = null;
  frame = new PIXI.Graphics();

  override get bounds(): Rectangle {
    return { x: this.document.x, y: this.document.y, width: Number(this.document.width), height: Number(this.document.height) };
  }

  protected override async _draw(): Promise<void> {
    const texture = await loadTexture(this.document.texture?.src);
    if (this.destroyed) return;
    this.mesh = new PIXI.Sprite(texture ?? PIXI.Texture.EMPTY);
    this.mesh.anchor.set(0.5);
    this.frame = new PIXI.Graphics();
    this.addChild(this.mesh, this.frame);
  }

  protected override _refresh(): void {
    const { x, y, width, height } = this.bounds;
    this.position.set(x, y);
    if (this.mesh) {
      this.mesh.width = width;
      this.mesh.height = height;
      this.mesh.position.set(width / 2, height / 2);
      this.mesh.angle = Number(this.document.rotation) || 0;
      this.mesh.tint = colorToNumber(this.document.texture?.tint, 0xffffff);
    }
    this.alpha = this.document.hidden ? 0.5 : Number(this.document.alpha ?? 1);
    this.frame.clear();
    if (this.controlled || (this.hover && this.layer?.active)) this.frame.lineStyle(3, this.controlled ? 0x3b82f6 : 0xffffff, 0.9).drawRect(0, 0, width, height);
    this.hitArea = new PIXI.Rectangle(0, 0, width, height);
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showTileMenu?.(this, event);
  }
}

const INACTIVE_WALL_ALPHA = 0.45;

export class Wall extends PlaceableObject {
  static override embeddedName = "Wall";
  line = new PIXI.Graphics();
  door: DoorControl | null = null;

  get coords(): [number, number, number, number] {
    const [ax = 0, ay = 0, bx = 0, by = 0] = (this.document.c ?? []) as number[];
    return [ax, ay, bx, by];
  }

  get segment(): Segment {
    const [ax, ay, bx, by] = this.coords;
    return { ax, ay, bx, by };
  }

  override get center(): Point {
    const [ax, ay, bx, by] = this.coords;
    return { x: (ax + bx) / 2, y: (ay + by) / 2 };
  }

  get isDoor(): boolean {
    return Number(this.document.door) > CONST.WALL_DOOR_TYPES.NONE;
  }

  get isOpen(): boolean {
    return this.isDoor && Number(this.document.ds) === CONST.WALL_DOOR_STATES.OPEN;
  }

  blocks(sense: "sight" | "move" | "light"): boolean {
    if (this.isOpen) return false;
    return Number(this.document[sense]) !== CONST.WALL_SENSE_TYPES.NONE;
  }

  get isLocked(): boolean {
    return this.isDoor && Number(this.document.ds) === CONST.WALL_DOOR_STATES.LOCKED;
  }

  /** Item a character must carry to open this door, as the GM typed it. */
  get requiredItem(): string | null {
    return requiredDoorItem(this.document);
  }

  /** The GM always sees walls (faded outside the walls layer); players only see doors. */
  override get isVisible(): boolean {
    return seesEverything() || this.isDoor;
  }

  protected override async _draw(): Promise<void> {
    this.line = new PIXI.Graphics();
    this.addChild(this.line);
    this.door = null;
    if (!this.isDoor) return;
    this.door = new DoorControl(currentCanvas()?.app?.ticker ?? null, (event) => this.#onDoorPointerDown(event));
    this.addChild(this.door);
  }

  protected override _refresh(): void {
    const editing = Boolean(this.layer?.active);
    this.#drawLine(editing);
    this.door?.update(this.#doorSegment(), { open: this.isOpen, locked: this.isLocked, keyed: this.requiredItem !== null }, this.#swingNext);
    this.#swingNext = false;
    this.hitArea = null;
    this.line.eventMode = editing ? "static" : "none";
    this.line.hitArea = editing ? this.#lineHitArea() : null;
    this.line.cursor = "pointer";
  }

  #swingNext = false;

  #doorSegment() {
    const [ax, ay, bx, by] = this.coords;
    return { hinge: { x: ax, y: ay }, latch: { x: bx, y: by } };
  }

  #drawLine(editing: boolean): void {
    const [ax, ay, bx, by] = this.coords;
    this.line.clear();
    if (!seesEverything() || (this.isDoor && !editing)) return;
    const color = this.isDoor ? (this.isOpen ? 0x5fd35f : 0xd38f2c) : this.controlled ? 0x3b82f6 : 0xf0f0f0;
    this.line.alpha = editing ? 1 : INACTIVE_WALL_ALPHA;
    this.line.lineStyle(9, 0x000000, 0.6).moveTo(ax, ay).lineTo(bx, by);
    this.line.lineStyle(4, color, 1).moveTo(ax, ay).lineTo(bx, by);
    this.line.lineStyle(0).beginFill(color).drawCircle(ax, ay, 6).drawCircle(bx, by, 6).endFill();
  }

  #lineHitArea(): PIXI.Polygon {
    const [ax, ay, bx, by] = this.coords;
    const angle = Math.atan2(by - ay, bx - ax);
    const thickness = 14;
    const offsetX = Math.sin(angle) * thickness;
    const offsetY = -Math.cos(angle) * thickness;
    return new PIXI.Polygon([ax + offsetX, ay + offsetY, bx + offsetX, by + offsetY, bx - offsetX, by - offsetY, ax - offsetX, ay - offsetY]);
  }

  protected override redrawKeys(): string[] {
    return ["door"];
  }

  override getMoveUpdate(deltaX: number, deltaY: number, snap: boolean): PlainObject {
    const [ax, ay, bx, by] = this.coords;
    let start = { x: ax + deltaX, y: ay + deltaY };
    if (snap) start = currentCanvas().grid.getSnappedPoint(start, { mode: "half" });
    const shiftX = start.x - ax;
    const shiftY = start.y - ay;
    return { _id: this.id, c: [ax + shiftX, ay + shiftY, bx + shiftX, by + shiftY].map(Math.round) };
  }

  override previewOffset(deltaX: number, deltaY: number): void {
    this.position.set(deltaX, deltaY);
  }

  override _onClickLeft2(): void {
    void this.toggleDoor();
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showWallMenu?.(this, event);
  }

  #onDoorPointerDown(event: PIXI.FederatedPointerEvent): void {
    if (event.button === 2) {
      if (currentGame()?.user?.isGM) this._onClickRight(event);
      return;
    }
    if (event.button === 0) void this.toggleDoor();
  }

  /** Opens or closes the door; the server repeats the lock and key checks, these only explain a refusal early. */
  async toggleDoor(): Promise<void> {
    if (!this.isDoor) return;
    const notifications = currentUi()?.notifications;
    if (this.isLocked) {
      notifications?.warn(currentGame()?.user?.isGM ? "Porta trancada. Use o botão direito para destrancar." : "A porta está trancada.");
      return;
    }
    const requiredItem = this.requiredItem;
    if (requiredItem && !currentGame()?.user?.isGM && !userCarriesItem(requiredItem)) {
      notifications?.warn(`Você precisa de "${requiredItem}" para abrir esta porta.`);
      return;
    }
    const nextState = this.isOpen ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN;
    try {
      await this.document.update({ ds: nextState });
    } catch {
      this.refresh();
    }
  }

  override _onUpdate(changed: PlainObject, options: PlainObject, userId: string): void {
    this.position.set(0, 0);
    if ("ds" in changed) this.#swingNext = true;
    super._onUpdate(changed, options, userId);
  }
}

export class AmbientLight extends PlaceableObject {
  static override embeddedName = "AmbientLight";
  icon = new PIXI.Graphics();
  glow = new PIXI.Graphics();

  get radius(): number {
    const config = this.document.config ?? {};
    return Math.max(Number(config.dim) || 0, Number(config.bright) || 0) * currentCanvas().dimensions.distancePixels;
  }

  get brightRadius(): number {
    return (Number(this.document.config?.bright) || 0) * currentCanvas().dimensions.distancePixels;
  }

  get color(): number {
    return colorToNumber(this.document.config?.color, 0xfff2c4);
  }

  get emitsLight(): boolean {
    return !this.document.hidden && this.radius > 0;
  }

  override get isVisible(): boolean {
    return Boolean(currentGame()?.user?.isGM) && Boolean(this.layer?.active);
  }

  protected override async _draw(): Promise<void> {
    this.icon = new PIXI.Graphics();
    this.addChild(this.icon);
  }

  protected override _refresh(): void {
    this.position.set(this.document.x, this.document.y);
    this.icon.clear();
    this.icon.lineStyle(3, this.controlled ? 0x3b82f6 : 0x000000, 1).beginFill(this.document.hidden ? 0x555555 : 0xffe066, 1).drawCircle(0, 0, 18).endFill();
    this.icon.lineStyle(2, 0x000000, 0.7);
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray * Math.PI) / 4;
      this.icon.moveTo(Math.cos(angle) * 22, Math.sin(angle) * 22).lineTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
    }
    this.icon.lineStyle(1, 0xffffff, 0.35).drawCircle(0, 0, this.radius);
    this.hitArea = new PIXI.Circle(0, 0, 32);
    this.cursor = "pointer";
  }

  protected override redrawKeys(): string[] {
    return [];
  }

  override _onClickLeft2(): void {
    currentCanvas()?.hud?.configureLight?.(this);
  }
}

export class Note extends PlaceableObject {
  static override embeddedName = "Note";
  icon: PIXI.Sprite | null = null;
  tooltip: PIXI.Text | null = null;

  get size(): number {
    return Number(this.document.iconSize) || 40;
  }

  override get bounds(): Rectangle {
    const size = this.size;
    return { x: this.document.x - size / 2, y: this.document.y - size / 2, width: size, height: size };
  }

  override get isVisible(): boolean {
    if (seesEverything()) return true;
    const entry = this.document.entry;
    return !entry || entry.testUserPermission?.(currentGame()?.user, "LIMITED") === true;
  }

  protected override async _draw(): Promise<void> {
    const texture = await loadTexture(this.document.texture?.src ?? "icons/svg/book.svg");
    if (this.destroyed) return;
    this.icon = new PIXI.Sprite(texture ?? PIXI.Texture.WHITE);
    this.icon.anchor.set(0.5);
    this.tooltip = new PIXI.Text(this.document.label ?? "", labelStyle(Number(this.document.fontSize) / 1.5 || 20, colorToNumber(this.document.textColor)));
    this.tooltip.anchor.set(0.5, 0);
    this.addChild(this.icon, this.tooltip);
  }

  protected override _refresh(): void {
    const size = this.size;
    this.position.set(this.document.x, this.document.y);
    if (this.icon) {
      this.icon.width = size;
      this.icon.height = size;
      this.icon.tint = this.controlled ? 0x3b82f6 : colorToNumber(this.document.texture?.tint, 0xffffff);
    }
    if (this.tooltip) {
      this.tooltip.text = this.document.label ?? "";
      this.tooltip.position.set(0, size / 2 + 4);
      this.tooltip.visible = this.hover || Boolean(this.layer?.active);
    }
    this.hitArea = new PIXI.Circle(0, 0, size / 2 + 4);
    this.cursor = "pointer";
  }

  override get snapMode(): "corner" | "center" | "half" {
    return "center";
  }

  protected override redrawKeys(): string[] {
    return ["texture", "fontSize", "textColor"];
  }

  override _onClickLeft2(): void {
    const entry = this.document.entry;
    if (entry) entry.sheet?.render(true);
    else currentCanvas()?.hud?.configureNote?.(this);
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    if (currentGame()?.user?.isGM) currentCanvas()?.hud?.configureNote?.(this, event);
  }
}
