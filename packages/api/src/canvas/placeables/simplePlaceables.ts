import * as PIXI from "pixi.js";
import { itemNamesMatch, requiredDoorItem, type PlainObject } from "@tabbletop/common";
import { CONST } from "../../constants";
import { Hooks } from "../../hooks/Hooks";
import { currentCanvas, currentGame, currentUi } from "../../runtime";
import type { Point, Rectangle, Segment } from "../geometry";
import type { SnapMode } from "../grid";
import { colorToNumber, loadTexture } from "../textures";
import { seesEverything } from "../perception/viewpoint";
import { DoorControl } from "./DoorControl";
import { PlaceableObject } from "./PlaceableObject";
import { createUnseenMarker, unseenMarkerRadius } from "./unseenMarker";
import { CREATION_TOOLS, WALL_SNAP_MODE } from "../interaction/creationTools";
import { wallSplitPoint } from "./wallSplit";

/** Whether any character the current user owns carries an item with this name. */
function userCarriesItem(itemName: string): boolean {
  const actors: any[] = currentGame()?.actors?.contents ?? [];
  return actors.some((actor) => actor.isOwner && Array.from((actor.items?.values?.() ?? []) as Iterable<any>).some((item) => itemNamesMatch(item.name, itemName)));
}

const NOTE_CLICK_SLOP_PX = 5;
const NOTE_DOUBLE_CLICK_MS = 360;

const labelStyle = (fontSize: number, fill = 0xffffff) =>
  new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize, fill, stroke: 0x111111, strokeThickness: 4, align: "center" });

/** How the layer holding a tile affects it; set by the app through `Tile.layerStateRule`. */
export interface TileLayerState {
  order: number;
  visible: boolean;
  opacity: number;
  locked: boolean;
}

/** Whether something the GM concealed (a trap, a perception check) is hidden from the current user; set by the app. */
export type ConcealRule = (document: any) => boolean;

function isConcealed(rule: ConcealRule | null, document: any): boolean {
  return rule?.(document) === true;
}

function isGameMaster(): boolean {
  return currentGame()?.user?.isGM === true;
}

/** Looking through a player's token, the GM still sees what that player missed, marked with a crossed-out eye. */
function syncUnseenMarker(owner: PIXI.Container, current: PIXI.Graphics | null, unseen: boolean, position: Point): PIXI.Graphics | null {
  if (!unseen) {
    if (current && !current.destroyed) current.destroy();
    return null;
  }
  const marker = current && !current.destroyed ? current : owner.addChild(createUnseenMarker(unseenMarkerRadius(Number(currentCanvas()?.grid?.size) || 100)));
  marker.position.set(position.x, position.y);
  return marker;
}

export class Tile extends PlaceableObject {
  static override embeddedName = "Tile";
  static layerStateRule: ((document: any) => TileLayerState) | null = null;
  static concealRule: ConcealRule | null = null;
  /** Opens a special editor for this tile (a chest, a trap); returns false to keep the default behaviour. */
  static doubleClickRule: ((tile: Tile) => boolean) | null = null;
  mesh: PIXI.Sprite | null = null;
  frame = new PIXI.Graphics();
  /** Size shown while the corner handle is being dragged, before the change is saved. */
  previewSize: { width: number; height: number } | null = null;

  get layerState(): TileLayerState | null {
    return (this.constructor as typeof Tile).layerStateRule?.(this.document) ?? null;
  }

  unseenMarker: PIXI.Graphics | null = null;

  get #concealed(): boolean {
    return isConcealed((this.constructor as typeof Tile).concealRule, this.document);
  }

  /** The current user may see this tile at all (not GM-hidden, its layer is shown, not concealed from them). */
  get isRevealed(): boolean {
    if (!super.isVisible || this.layerState?.visible === false) return false;
    return isGameMaster() || !this.#concealed;
  }

  override get isVisible(): boolean {
    return this.isRevealed && !currentCanvas()?.visibility?.isOutOfSight?.(this);
  }

  /** The GM sees concealed tiles faded, like hidden ones. */
  get #fadedForGameMaster(): boolean {
    return this.document.hidden === true || (isGameMaster() && this.#concealed);
  }

  /** A locked layer cannot be clicked, selected or dragged, by anyone. */
  override canControl(user: any = currentGame()?.user): boolean {
    return super.canControl(user) && this.layerState?.locked !== true;
  }

  override get bounds(): Rectangle {
    const size = this.previewSize ?? { width: Number(this.document.width), height: Number(this.document.height) };
    return { x: this.document.x, y: this.document.y, ...size };
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
    const layerState = this.layerState;
    this.zIndex = layerState?.order ?? (Number(this.document.sort) || 0);
    this.eventMode = layerState?.locked ? "none" : "static";
    this.alpha = (this.#fadedForGameMaster ? 0.5 : Number(this.document.alpha ?? 1)) * (layerState?.opacity ?? 1);
    this.unseenMarker = syncUnseenMarker(this, this.unseenMarker, isGameMaster() && !seesEverything() && this.#concealed, { x: width / 2, y: height / 2 });
    this.frame.clear();
    if (this.controlled || (this.hover && this.layer?.active)) this.frame.lineStyle(3, this.controlled ? 0x3b82f6 : 0xffffff, 0.9).drawRect(0, 0, width, height);
    const handle = this.resizable ? this.resizeHandleSize : 0;
    if (handle > 0) this.frame.lineStyle(2, 0xffffff, 1).beginFill(0x3b82f6, 1).drawRect(width - handle / 2, height - handle / 2, handle, handle).endFill();
    this.hitArea = new PIXI.Rectangle(0, 0, width + handle / 2, height + handle / 2);
  }

  /** Objects that do not fill whole squares move by quarter squares so they can sit anywhere inside one. */
  override get snapMode(): SnapMode {
    const size = Number(currentCanvas()?.grid?.size) || 100;
    const { width, height } = this.bounds;
    return width % size === 0 && height % size === 0 ? "corner" : "quarter";
  }

  /** The selected tile shows a corner handle; dragging it resizes the tile. */
  get resizable(): boolean {
    return this.controlled && this.canDrag();
  }

  get resizeHandleSize(): number {
    return Math.max(12, Math.round((Number(currentCanvas()?.grid?.size) || 100) * 0.16));
  }

  /** Whether a canvas point grabs the resize handle (bottom-right corner). */
  grabsResizeHandle(point: Point): boolean {
    if (!this.resizable) return false;
    const { x, y, width, height } = this.bounds;
    const reach = this.resizeHandleSize;
    return Math.abs(point.x - (x + width)) <= reach && Math.abs(point.y - (y + height)) <= reach;
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showTileMenu?.(this, event);
  }

  override _onClickLeft2(event?: PIXI.FederatedPointerEvent): void {
    if ((this.constructor as typeof Tile).doubleClickRule?.(this)) return;
    super._onClickLeft2(event);
  }
}

const INACTIVE_WALL_ALPHA = 0.45;
const DOOR_DOUBLE_CLICK_MS = 360;

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
    this.door.visible = seesEverything();
    this.addChild(this.door);
    currentCanvas()?.perception?.update?.();
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
    const color = this.controlled ? 0x3b82f6 : this.isDoor ? (this.isOpen ? 0x5fd35f : 0xd38f2c) : 0xf0f0f0;
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

  /** With a wall or door tool, an unselected wall ignores the press so a new wall can start on top of it. */
  protected override passesPressToBoard(): boolean {
    if (!this.layer?.active || this.controlled) return false;
    const toolName = currentUi()?.controls?.tool?.name ?? "";
    return CREATION_TOOLS[this.layer.name ?? ""]?.[toolName]?.documentName === "Wall";
  }

  /** Both ends land on grid points, so a wall drawn off the grid also ends up on it once moved. */
  override getMoveUpdate(deltaX: number, deltaY: number, snap: boolean): PlainObject {
    const [ax, ay, bx, by] = this.coords;
    const grid = currentCanvas().grid;
    const place = (x: number, y: number) => (snap ? grid.getSnappedPoint({ x, y }, { mode: WALL_SNAP_MODE }) : { x, y });
    const start = place(ax + deltaX, ay + deltaY);
    const end = place(bx + deltaX, by + deltaY);
    return { _id: this.id, c: [start.x, start.y, end.x, end.y].map(Math.round) };
  }

  override previewOffset(deltaX: number, deltaY: number): void {
    const [ax, ay] = this.coords;
    const [nextX, nextY] = this.getMoveUpdate(deltaX, deltaY, true).c as number[];
    this.position.set((nextX ?? ax) - ax, (nextY ?? ay) - ay);
  }

  /** Double click swings a door; on a plain wall the GM cuts it in two there, to fit a door in the gap. */
  override _onClickLeft2(event?: PIXI.FederatedPointerEvent): void {
    if (this.isDoor) {
      void this.toggleDoor();
      return;
    }
    if (event && currentGame()?.user?.isGM && this.layer?.active) void this.splitAt(event.getLocalPosition(this));
  }

  /** Cuts this wall in two at the given point; both pieces keep every setting of the original. */
  async splitAt(click: Point): Promise<boolean> {
    const [ax, ay, bx, by] = this.coords;
    const corner = currentCanvas()?.grid?.getSnappedPoint?.(click, { mode: WALL_SNAP_MODE }) ?? null;
    const cut = wallSplitPoint(this.segment, click, corner);
    const notifications = currentUi()?.notifications;
    if (!cut) {
      notifications?.warn("Muito perto da ponta para cortar a parede.");
      return false;
    }
    const secondPiece = { ...this.document.toObject(), c: [cut.x, cut.y, bx, by] };
    delete secondPiece._id;
    try {
      await this.document.update({ c: [ax, ay, cut.x, cut.y] });
      await this.document.parent.createEmbeddedDocuments("Wall", [secondPiece]);
      return true;
    } catch {
      await this.document.update({ c: [ax, ay, bx, by] }).catch(() => undefined);
      notifications?.warn("Não foi possível cortar a parede.");
      return false;
    }
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    currentCanvas()?.hud?.showWallMenu?.(this, event);
  }

  #onDoorPointerDown(event: PIXI.FederatedPointerEvent): void {
    if (event.button === 2) {
      if (currentGame()?.user?.isGM) this._onClickRight(event);
      return;
    }
    if (event.button !== 0) return;
    if (this.#isBeingEdited()) {
      this.#selectDoor(event);
      return;
    }
    void this.toggleDoor();
  }

  #isBeingEdited(): boolean {
    return Boolean(this.layer?.active) && currentUi()?.controls?.tool?.name === "select";
  }

  #lastDoorClick = 0;

  /** While editing walls the door icon selects and drags the door like any wall; a double click still swings it. */
  #selectDoor(event: PIXI.FederatedPointerEvent): void {
    const now = performance.now();
    const isDoubleClick = now - this.#lastDoorClick < DOOR_DOUBLE_CLICK_MS;
    this.#lastDoorClick = now;
    if (isDoubleClick) {
      void this.toggleDoor();
      return;
    }
    if (!this.controlled) this.control({ releaseOthers: !event.shiftKey });
    else if (event.shiftKey) {
      this.release();
      return;
    }
    if (this.canDrag()) currentCanvas()?.interaction?.beginObjectDrag(this, event);
  }

  /** Opens or closes the door; the server repeats the sight, lock and key checks, these only explain a refusal early. */
  async toggleDoor(): Promise<void> {
    if (!this.isDoor) return;
    const notifications = currentUi()?.notifications;
    if (this.isLocked) {
      notifications?.warn(currentGame()?.user?.isGM ? "Porta trancada pelo mestre. Use o botão direito para destrancar." : "Trancada pelo mestre: só abre quando o mestre destrancar.");
      return;
    }
    if (!currentGame()?.user?.isGM && currentCanvas()?.perception?.isDoorVisible?.(this) === false) {
      notifications?.warn("Você não vê esta porta.");
      return;
    }
    const requiredItem = this.requiredItem;
    if (requiredItem && !currentGame()?.user?.isGM && !userCarriesItem(requiredItem)) {
      notifications?.warn(`Trancada a chave: você precisa de "${requiredItem}" para abrir.`);
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
  static concealRule: ConcealRule | null = null;
  icon: PIXI.Sprite | null = null;
  tooltip: PIXI.Text | null = null;

  get size(): number {
    return Number(this.document.iconSize) || 40;
  }

  override get bounds(): Rectangle {
    const size = this.size;
    return { x: this.document.x - size / 2, y: this.document.y - size / 2, width: size, height: size };
  }

  unseenMarker: PIXI.Graphics | null = null;

  /** The current user may see this note at all: its journal is shared with them and it is not concealed from them. */
  get isRevealed(): boolean {
    if (isGameMaster()) return true;
    const entry = this.document.entry;
    if (entry && entry.testUserPermission?.(currentGame()?.user, "LIMITED") !== true) return false;
    return !isConcealed((this.constructor as typeof Note).concealRule, this.document);
  }

  override get isVisible(): boolean {
    return this.isRevealed && !currentCanvas()?.visibility?.isOutOfSight?.(this);
  }

  protected override async _draw(): Promise<void> {
    this.#listenForClicks();
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
    const concealed = isGameMaster() && isConcealed((this.constructor as typeof Note).concealRule, this.document);
    this.alpha = concealed ? 0.5 : 1;
    this.unseenMarker = syncUnseenMarker(this, this.unseenMarker, concealed && !seesEverything(), { x: size / 2, y: -size / 2 });
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

  override get answersOnEveryLayer(): boolean {
    return true;
  }

  override canDragWithoutControl(user: any): boolean {
    return Boolean(user?.isGM) || this.document.testUserPermission?.(user, "OWNER") === true;
  }

  get #canEdit(): boolean {
    return this.canDragWithoutControl(currentGame()?.user);
  }

  #pressedAt: Point | null = null;
  #pendingOpen: ReturnType<typeof setTimeout> | null = null;

  #listenForClicks(): void {
    if (this.listenerCount("pointertap") > 0) return;
    this.on("pointerdown", (event: PIXI.FederatedPointerEvent) => {
      this.#pressedAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    });
    this.on("pointertap", (event: PIXI.FederatedPointerEvent) => {
      const pressedAt = this.#pressedAt;
      if (!pressedAt || Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > NOTE_CLICK_SLOP_PX) return;
      if (this.#pendingOpen) return;
      this.#pendingOpen = setTimeout(() => {
        this.#pendingOpen = null;
        if (!this.destroyed) this.activate();
      }, NOTE_DOUBLE_CLICK_MS);
    });
  }

  /** Shows what the note says; the app answers the `activateNote` hook, falling back to the linked journal. */
  activate(): void {
    if (Hooks.call("activateNote", this, {}) === false) return;
    this.document.entry?.sheet?.render(true);
  }

  override _onClickLeft2(): void {
    if (this.#pendingOpen) clearTimeout(this.#pendingOpen);
    this.#pendingOpen = null;
    if (this.#canEdit) void currentCanvas()?.hud?.configureNote?.(this);
    else this.activate();
  }

  override _onClickRight(event: PIXI.FederatedPointerEvent): void {
    if (this.#canEdit) currentCanvas()?.hud?.showNoteMenu?.(this, event);
  }
}
