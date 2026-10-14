import * as PIXI from "pixi.js";
import type { PlainObject } from "@tabbletop/common";
import { Hooks } from "../../hooks/Hooks";
import { currentGame, currentUi } from "../../runtime";
import { segmentsCross, type Point } from "../geometry";
import type { PlaceableObject } from "../placeables/PlaceableObject";
import type { Token } from "../placeables/Token";
import type { Wall } from "../placeables/simplePlaceables";
import { colorToNumber } from "../textures";
import { CREATION_TOOLS, type CreationTool } from "./creationTools";
import { handleCanvasDrop } from "./canvasDrop";

const CLICK_TOLERANCE_PX = 4;
const FREEHAND_SAMPLE_PX = 8;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const GHOST_ALPHA = 0.6;
const CONFIRM_OFFSET_PX = 18;

type Session =
  | { kind: "pan"; startClient: Point; startPivot: Point; button: number }
  | { kind: "select"; origin: Point; additive: boolean }
  | { kind: "ruler"; origin: Point }
  | { kind: "create"; origin: Point; tool: CreationTool; points: number[] }
  | { kind: "move"; origin: Point; objects: PlaceableObject[] };

export type MovePathMode = "modifier" | "always" | "never";

/** Pointer, wheel, keyboard and drop handling for the board. One drag session is active at a time. */
export class CanvasInteraction {
  readonly overlay = new PIXI.Graphics();
  readonly label = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 28, fill: 0xffffff, stroke: 0x111111, strokeThickness: 5 }));
  #session: Session | null = null;
  #lastWorld: Point = { x: 0, y: 0 };
  /** When a token drop shows the path and waits for confirmation: only while the path key is held, always, or never. */
  movePathMode: MovePathMode = "modifier";
  /** Kept current by the client's rebindable "path key" keybinding. */
  pathModifierHeld = false;
  #listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(private readonly canvas: any) {}

  attach(view: HTMLCanvasElement, board: HTMLElement): void {
    const stage = this.canvas.stage as PIXI.Container;
    stage.eventMode = "static";
    stage.hitArea = new PIXI.Rectangle(-1e6, -1e6, 2e6, 2e6);
    stage.on("pointerdown", (event: PIXI.FederatedPointerEvent) => this.#onStagePointerDown(event));
    stage.on("globalpointermove", (event: PIXI.FederatedPointerEvent) => this.#onPointerMove(event));
    stage.on("pointerup", (event: PIXI.FederatedPointerEvent) => this.#onPointerUp(event));
    stage.on("pointerupoutside", (event: PIXI.FederatedPointerEvent) => this.#onPointerUp(event));
    this.label.anchor.set(0.5, 1.2);
    this.#listen(view, "wheel", (event) => this.#onWheel(event as WheelEvent), { passive: false });
    this.#listen(view, "contextmenu", (event) => event.preventDefault());
    this.#listen(board, "dragover", (event) => event.preventDefault());
    this.#listen(board, "drop", (event) => void this.#onDrop(event as DragEvent));
    this.#listen(window, "keydown", (event) => this.#onKeyDown(event as KeyboardEvent));
    this.#listen(window, "blur", () => {
      this.pathModifierHeld = false;
    });
  }

  get #pathModeActive(): boolean {
    if (this.movePathMode === "always") return true;
    return this.movePathMode === "modifier" && this.pathModifierHeld;
  }

  detach(): void {
    for (const [target, type, listener] of this.#listeners) target.removeEventListener(type, listener);
    this.#listeners = [];
  }

  get worldPosition(): Point {
    return this.#lastWorld;
  }

  beginObjectDrag(placeable: PlaceableObject, event: PIXI.FederatedPointerEvent): void {
    const objects = (placeable.layer.controlled as PlaceableObject[]).filter((object) => object.canDrag());
    if (objects.length === 0) return;
    this.#session = { kind: "move", origin: this.#toWorld(event), objects };
  }

  #listen(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions): void {
    target.addEventListener(type, listener, options);
    this.#listeners.push([target, type, listener]);
  }

  #toWorld(event: PIXI.FederatedPointerEvent): Point {
    const point = event.getLocalPosition(this.canvas.stage);
    return { x: point.x, y: point.y };
  }

  #activeTool(): string {
    return currentUi()?.controls?.tool?.name ?? "select";
  }

  #onStagePointerDown(event: PIXI.FederatedPointerEvent): void {
    if (!this.canvas.ready) return;
    const world = this.#toWorld(event);
    if (event.button === 1 || event.button === 2) {
      this.#session = { kind: "pan", startClient: { x: event.clientX, y: event.clientY }, startPivot: { x: this.canvas.stage.pivot.x, y: this.canvas.stage.pivot.y }, button: event.button };
      return;
    }
    if (event.button !== 0) return;
    this.canvas.hud.cancelMoveConfirmation();
    const layerName = this.canvas.activeLayer?.name ?? "";
    const tool = CREATION_TOOLS[layerName]?.[this.#activeTool()];
    if (tool && this.#mayCreate(tool.documentName)) {
      const origin = event.shiftKey ? world : this.canvas.grid.getSnappedPoint(world, { mode: tool.snapMode });
      this.#session = { kind: "create", origin, tool, points: [world.x, world.y] };
      return;
    }
    if (this.#activeTool() === "ruler") {
      this.#session = { kind: "ruler", origin: this.canvas.grid.getSnappedPoint(world, { mode: "center" }) };
      return;
    }
    this.#session = { kind: "select", origin: world, additive: event.shiftKey };
  }

  #mayCreate(documentName: string): boolean {
    const documentClass = this.canvas.scene?.getEmbeddedCollection(documentName)?.documentClass;
    return Boolean(documentClass?.canUserCreate?.(currentGame()?.user));
  }

  #onPointerMove(event: PIXI.FederatedPointerEvent): void {
    const world = this.#toWorld(event);
    this.#lastWorld = world;
    const session = this.#session;
    if (!session) return;
    switch (session.kind) {
      case "pan": {
        const scale = this.canvas.stage.scale.x;
        this.canvas.pan({ x: session.startPivot.x - (event.clientX - session.startClient.x) / scale, y: session.startPivot.y - (event.clientY - session.startClient.y) / scale });
        break;
      }
      case "move":
        for (const object of session.objects) object.previewOffset(world.x - session.origin.x, world.y - session.origin.y);
        if (this.#pathModeActive) this.#previewTokenPath(session.objects[0], world.x - session.origin.x, world.y - session.origin.y, !event.shiftKey);
        else this.#clearOverlay();
        break;
      case "create":
        this.#previewCreation(session, world, event.shiftKey);
        break;
      case "select":
        this.#drawOverlay((graphics) => graphics.lineStyle(2, 0x3b82f6, 1).beginFill(0x3b82f6, 0.1).drawRect(Math.min(session.origin.x, world.x), Math.min(session.origin.y, world.y), Math.abs(world.x - session.origin.x), Math.abs(world.y - session.origin.y)).endFill());
        break;
      case "ruler":
        this.#previewRuler(session.origin, this.canvas.grid.getSnappedPoint(world, { mode: "center" }));
        break;
    }
  }

  #previewCreation(session: Extract<Session, { kind: "create" }>, world: Point, freeSnap: boolean): void {
    const lastX = session.points[session.points.length - 2];
    const lastY = session.points[session.points.length - 1];
    if (Math.hypot(world.x - lastX, world.y - lastY) >= FREEHAND_SAMPLE_PX) session.points.push(world.x, world.y);
    const destination = freeSnap ? world : this.canvas.grid.getSnappedPoint(world, { mode: session.tool.snapMode });
    const origin = session.origin;
    this.#drawOverlay((graphics) => {
      graphics.lineStyle(3, 0x3b82f6, 1);
      if (session.tool.documentName === "Wall") graphics.moveTo(origin.x, origin.y).lineTo(destination.x, destination.y);
      else if (session.tool.documentName === "MeasuredTemplate") graphics.beginFill(0xff6400, 0.25).drawCircle(origin.x, origin.y, Math.hypot(destination.x - origin.x, destination.y - origin.y)).endFill();
      else if (session.points.length > 4 && session.tool.build(origin, destination, this.#creationContext(false), session.points)?.shape?.type === "p") graphics.drawPolygon(session.points);
      else graphics.beginFill(0x3b82f6, 0.15).drawRect(Math.min(origin.x, destination.x), Math.min(origin.y, destination.y), Math.abs(destination.x - origin.x), Math.abs(destination.y - origin.y)).endFill();
    });
  }

  /** Path from the token's current center to where it would land, with the distance it walks. */
  #previewTokenPath(object: PlaceableObject | undefined, deltaX: number, deltaY: number, snap: boolean): { label: string; end: Point } | null {
    if (!object || object.document.documentName !== "Token") return null;
    const token = object as Token;
    const update = token.getMoveUpdate(deltaX, deltaY, snap);
    const start = { x: token.document.x + token.w / 2, y: token.document.y + token.h / 2 };
    const end = { x: Number(update.x) + token.w / 2, y: Number(update.y) + token.h / 2 };
    const label = this.#pathLabel(start, end);
    const color = colorToNumber(currentGame()?.user?.color, 0x3b82f6);
    this.#drawOverlay((graphics) => {
      graphics.lineStyle(10, 0x000000, 0.45).moveTo(start.x, start.y).lineTo(end.x, end.y);
      graphics.lineStyle(5, color, 0.95).moveTo(start.x, start.y).lineTo(end.x, end.y);
      graphics.lineStyle(3, 0x000000, 0.6).beginFill(color, 0.9).drawCircle(start.x, start.y, 7).drawCircle(end.x, end.y, 10).endFill();
    });
    this.label.text = label;
    this.label.position.set(end.x, end.y - token.h / 2);
    this.label.visible = true;
    return { label, end };
  }

  #pathLabel(start: Point, end: Point): string {
    const grid = this.canvas.grid;
    const distance = grid.measureDistance(start, end);
    const squares = grid.distance > 0 ? Math.round(distance / grid.distance) : 0;
    const units = this.canvas.dimensions?.units ? ` ${this.canvas.dimensions.units}` : "";
    return `${squares} ${squares === 1 ? "quadrado" : "quadrados"} (${String(distance).replace(".", ",")}${units})`;
  }

  #previewRuler(origin: Point, destination: Point): void {
    const distance = this.canvas.grid.measureDistance(origin, destination);
    this.#drawOverlay((graphics) => {
      graphics.lineStyle(6, 0x000000, 0.6).moveTo(origin.x, origin.y).lineTo(destination.x, destination.y);
      graphics.lineStyle(3, colorToNumber(currentGame()?.user?.color, 0x3b82f6), 1).moveTo(origin.x, origin.y).lineTo(destination.x, destination.y);
    });
    this.label.text = `${distance} ${this.canvas.dimensions.units}`;
    this.label.position.set(destination.x, destination.y);
    this.label.visible = true;
  }

  #drawOverlay(paint: (graphics: PIXI.Graphics) => void): void {
    this.overlay.clear();
    paint(this.overlay);
  }

  #clearOverlay(): void {
    this.overlay.clear();
    this.label.visible = false;
  }

  #creationContext(snap: boolean) {
    return { grid: this.canvas.grid, dimensions: this.canvas.dimensions, snap };
  }

  #onPointerUp(event: PIXI.FederatedPointerEvent): void {
    const session = this.#session;
    this.#session = null;
    this.#clearOverlay();
    if (!session) return;
    const world = this.#toWorld(event);
    switch (session.kind) {
      case "move":
        void this.#commitMove(session.objects, world.x - session.origin.x, world.y - session.origin.y, !event.shiftKey, this.#pathModeActive);
        break;
      case "create":
        void this.#commitCreation(session, event.shiftKey ? world : this.canvas.grid.getSnappedPoint(world, { mode: session.tool.snapMode }), world);
        break;
      case "select":
        this.#commitSelection(session.origin, world, session.additive);
        break;
      case "pan":
        this.#openBoardMenuOnRightClick(session, event, world);
        break;
      default:
        break;
    }
  }

  /** A right click on an empty spot (no drag) lets packages and the client offer actions for that point. */
  #openBoardMenuOnRightClick(session: Extract<Session, { kind: "pan" }>, event: PIXI.FederatedPointerEvent, world: Point): void {
    if (session.button !== 2) return;
    if (Math.hypot(event.clientX - session.startClient.x, event.clientY - session.startClient.y) > CLICK_TOLERANCE_PX) return;
    Hooks.callAll("canvasContextMenu", world, { x: event.clientX, y: event.clientY });
  }

  #commitSelection(origin: Point, world: Point, additive: boolean): void {
    const layer = this.canvas.activeLayer;
    if (!layer?.selectObjects) return;
    const dragged = Math.hypot(world.x - origin.x, world.y - origin.y) > CLICK_TOLERANCE_PX;
    if (!dragged) {
      if (!additive) layer.releaseAll();
      return;
    }
    layer.selectObjects({ x: Math.min(origin.x, world.x), y: Math.min(origin.y, world.y), width: Math.abs(world.x - origin.x), height: Math.abs(world.y - origin.y) }, { releaseOthers: !additive });
  }

  async #commitMove(objects: PlaceableObject[], deltaX: number, deltaY: number, snap: boolean, confirmPath: boolean): Promise<void> {
    if (Math.hypot(deltaX, deltaY) <= CLICK_TOLERANCE_PX) {
      for (const object of objects) object.refresh();
      return;
    }
    const updates: PlainObject[] = [];
    const moving: PlaceableObject[] = [];
    for (const object of objects) {
      const update = object.getMoveUpdate(deltaX, deltaY, snap);
      if (object.document.documentName === "Token" && this.#blockedByWall(object as Token, update)) {
        currentUi()?.notifications?.warn("Uma parede bloqueia esse movimento.");
        object.refresh();
        continue;
      }
      updates.push(update);
      moving.push(object);
    }
    if (updates.length === 0) return;
    if (confirmPath && !(await this.#confirmTokenPath(moving, updates, deltaX, deltaY, snap))) return;
    try {
      await objects[0]?.layer.updateAll(updates);
    } catch {
      for (const object of objects) if (!object.destroyed) object.refresh();
    }
  }

  /** Tokens wait at their destination as a ghost with the path drawn until the user confirms; then they walk there. */
  async #confirmTokenPath(objects: PlaceableObject[], updates: PlainObject[], deltaX: number, deltaY: number, snap: boolean): Promise<boolean> {
    const first = objects[0];
    if (first?.document.documentName !== "Token") return true;
    objects.forEach((object, index) => {
      object.previewOffset(Number(updates[index].x) - object.document.x, Number(updates[index].y) - object.document.y);
      object.alpha = GHOST_ALPHA;
    });
    const path = this.#previewTokenPath(first, deltaX, deltaY, snap);
    const client = this.canvas.clientCoordinatesFromCanvas(path?.end ?? first.center);
    const confirmed = await this.canvas.hud.confirmMove({ x: client.x + CONFIRM_OFFSET_PX, y: client.y + CONFIRM_OFFSET_PX }, `Andar ${path?.label ?? ""}?`);
    this.#clearOverlay();
    for (const object of objects) if (!object.destroyed) object.refresh();
    return confirmed && objects.every((object) => !object.destroyed);
  }

  /** Players cannot walk through movement-blocking walls; the GM may. */
  #blockedByWall(token: Token, update: PlainObject): boolean {
    if (currentGame()?.user?.isGM) return false;
    const from = { x: token.document.x + token.w / 2, y: token.document.y + token.h / 2 };
    const to = { x: Number(update.x) + token.w / 2, y: Number(update.y) + token.h / 2 };
    const walls = (this.canvas.walls?.placeables ?? []) as Wall[];
    return walls.some((wall) => wall.blocks("move") && segmentsCross(from, to, wall.segment));
  }

  async #commitCreation(session: Extract<Session, { kind: "create" }>, destination: Point, world: Point): Promise<void> {
    const dragged = Math.hypot(world.x - session.origin.x, world.y - session.origin.y);
    if (dragged < session.tool.minimumDrag) return;
    const data = session.tool.build(session.origin, destination, this.#creationContext(true), session.points);
    if (!data) return;
    const prepared = await this.canvas.hud.prepareCreation(session.tool.documentName, data);
    if (!prepared) return;
    await this.canvas.scene.createEmbeddedDocuments(session.tool.documentName, [prepared]);
  }

  #onWheel(event: WheelEvent): void {
    if (!this.canvas.ready) return;
    event.preventDefault();
    const stage = this.canvas.stage as PIXI.Container;
    const factor = Math.pow(1.0015, -event.deltaY);
    const scale = Math.min(Math.max(stage.scale.x * factor, MIN_ZOOM), MAX_ZOOM);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const before = stage.toLocal(screen);
    stage.scale.set(scale);
    const after = stage.toLocal(screen);
    this.canvas.pan({ x: stage.pivot.x + (before.x - after.x), y: stage.pivot.y + (before.y - after.y), scale });
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (!this.canvas.ready || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      const layer = this.canvas.activeLayer;
      if (layer?.controlled?.length) {
        event.preventDefault();
        void layer.deleteControlled();
      }
    } else if (event.key === "Escape") {
      this.canvas.activeLayer?.releaseAll?.();
    }
  }

  async #onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.canvas.ready) return;
    const raw = event.dataTransfer?.getData("text/plain") ?? "";
    const rect = (this.canvas.app.view as HTMLCanvasElement).getBoundingClientRect();
    const world = (this.canvas.stage as PIXI.Container).toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const dropData = { ...(data as PlainObject), x: world.x, y: world.y };
    if (Hooks.call("dropCanvasData", this.canvas, dropData, event) === false) return;
    await handleCanvasDrop(this.canvas, dropData);
  }
}
