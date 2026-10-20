import * as PIXI from "pixi.js";
import type { PlainObject } from "@tabbletop/common";
import { Hooks } from "../../hooks/Hooks";
import { currentGame, currentUi } from "../../runtime";
import { segmentsCross, type Point } from "../geometry";
import type { PlaceableObject } from "../placeables/PlaceableObject";
import type { Token } from "../placeables/Token";
import type { Tile, Wall } from "../placeables/simplePlaceables";
import { colorToNumber } from "../textures";
import { CREATION_TOOLS, WALL_SNAP_MODE, type CreationTool } from "./creationTools";
import { handleCanvasDrop } from "./canvasDrop";
import { paintCreationPreview } from "./creationPreview";
import { defaultDrawingColor } from "../hud/drawingFields";

const CLICK_TOLERANCE_PX = 4;
const FREEHAND_SAMPLE_PX = 8;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const GHOST_ALPHA = 0.6;
const CONFIRM_OFFSET_PX = 18;
const HOLD_TO_CREATE_MS = 150;
const ENDPOINT_GRAB_PX = 14;

type Session =
  | { kind: "pan"; startClient: Point; startPivot: Point; button: number }
  | { kind: "select"; origin: Point; additive: boolean }
  | { kind: "ruler"; origin: Point }
  | { kind: "create"; origin: Point; tool: CreationTool; points: number[]; startedAt: number }
  | { kind: "move"; origin: Point; objects: PlaceableObject[] }
  | { kind: "endpoint"; wall: Wall; index: 0 | 1 }
  | {
      kind: "resize";
      target: Tile | Token;
      initialWidth: number;
      initialHeight: number;
      initialRatio: number;
      center: Point;
    }
  | {
      kind: "rotate";
      target: Tile | Token;
      center: Point;
      initialRotation: number;
    };

export type MovePathMode = "modifier" | "always" | "never";

/** Pointer, wheel, keyboard and drop handling for the board. One drag session is active at a time. */
export class CanvasInteraction {
  readonly overlay = new PIXI.Graphics();
  readonly label = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 28, fill: 0xffffff, stroke: 0x111111, strokeThickness: 5 }));
  readonly stepRulerOverlay = new PIXI.Graphics();
  readonly stepRulerLabel = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 24, fontWeight: "bold", fill: 0xffffff, stroke: 0x111111, strokeThickness: 5 }));
  #stepRulerState: {
    tokenId: string;
    waypoints: Point[];
    lastCell: { i: number; j: number };
    totalSteps: number;
    totalDistance: number;
  } | null = null;
  #session: Session | null = null;
  #lastWorld: Point = { x: 0, y: 0 };
  /** When a token drop shows the path and waits for confirmation: only while the path key is held, always, or never. */
  movePathMode: MovePathMode = "modifier";
  /** Kept current by the client's rebindable "path key" keybinding. */
  pathModifierHeld = false;
  #listeners: Array<[EventTarget, string, EventListener]> = [];
  #hookEntries: Array<{ hook: string; id: number }> = [];

  constructor(private readonly canvas: any) {
    if (this.canvas) this.canvas.interaction = this;
  }

  attach(view: HTMLCanvasElement, board: HTMLElement): void {
    const stage = this.canvas.stage as PIXI.Container;
    stage.eventMode = "static";
    stage.hitArea = new PIXI.Rectangle(-1e6, -1e6, 2e6, 2e6);
    stage.on("pointerdown", (event: PIXI.FederatedPointerEvent) => this.#onStagePointerDown(event));
    stage.on("globalpointermove", (event: PIXI.FederatedPointerEvent) => this.#onPointerMove(event));
    stage.on("pointerup", (event: PIXI.FederatedPointerEvent) => this.#onPointerUp(event));
    stage.on("pointerupoutside", (event: PIXI.FederatedPointerEvent) => this.#onPointerUp(event));
    this.label.anchor.set(0.5, 1.2);
    this.stepRulerLabel.anchor.set(0.5, 1.2);
    this.stepRulerOverlay.eventMode = "none";
    this.stepRulerLabel.eventMode = "none";
    this.#listen(view, "wheel", (event) => this.#onWheel(event as WheelEvent), { passive: false });
    this.#listen(view, "contextmenu", (event) => event.preventDefault());
    this.#listen(board, "dragover", (event) => event.preventDefault());
    this.#listen(board, "drop", (event) => void this.#onDrop(event as DragEvent));
    this.#listen(window, "keydown", (event) => this.#onKeyDown(event as KeyboardEvent));
    this.#listen(window, "blur", () => {
      this.pathModifierHeld = false;
    });

    const dragHookId = Hooks.on("dragTokenPreview", (tokens: any[]) => {
      if (this.#activeTool() !== "stepRuler") return;
      const state = this.#stepRulerState;
      if (!state) return;
      const match = tokens.find((t: any) => t.tokenId === state.tokenId);
      if (!match) return;
      const token = (this.canvas.tokens?.placeables ?? []).find((t: PlaceableObject) => t.id === match.tokenId) as Token | undefined;
      if (!token) return;
      const grid = this.canvas.grid;
      const rawPos = { x: match.x, y: match.y };
      const snappedPos = grid.isGridless ? rawPos : grid.getSnappedPoint(rawPos, { mode: token.snapMode ?? "corner" });
      const center = { x: snappedPos.x + token.w / 2, y: snappedPos.y + token.h / 2 };
      this.stepRulerTrackMovement(center);
    });
    this.#hookEntries.push({ hook: "dragTokenPreview", id: dragHookId });

    const controlHookId = Hooks.on("controlToken", (token: Token, controlled: boolean) => {
      if (this.#activeTool() !== "stepRuler") return;
      if (controlled) {
        if (!this.#stepRulerState || this.#stepRulerState.tokenId !== token.id) {
          this.initStepRuler(token);
        }
      } else {
        if (this.#stepRulerState?.tokenId === token.id && (this.canvas.tokens?.controlled?.length ?? 0) === 0) {
          this.clearStepRuler();
        }
      }
    });
    this.#hookEntries.push({ hook: "controlToken", id: controlHookId });
  }

  get #pathModeActive(): boolean {
    if (this.movePathMode === "always") return true;
    return this.movePathMode === "modifier" && this.pathModifierHeld;
  }

  detach(): void {
    for (const [target, type, listener] of this.#listeners) target.removeEventListener(type, listener);
    this.#listeners = [];
    for (const entry of this.#hookEntries) Hooks.off(entry.hook, entry.id);
    this.#hookEntries = [];
  }

  get worldPosition(): Point {
    return this.#lastWorld;
  }

  /** Keyboard movement: shifts the given tokens by whole grid squares, with the same wall and permission rules as dragging. */
  async stepTokens(tokens: PlaceableObject[], columns: number, rows: number): Promise<void> {
    const movable = tokens.filter((token) => token.document.documentName === "Token" && token.canDrag());
    if (movable.length === 0 || this.#session) return;
    const gridSize = this.canvas.grid.size;
    this.canvas.hud.cancelMoveConfirmation();
    await this.#commitMove(movable, columns * gridSize, rows * gridSize, true, false);
  }

  beginObjectDrag(placeable: PlaceableObject, event: PIXI.FederatedPointerEvent): void {
    if (placeable.document.documentName === "Wall") {
      const index = this.#grabbedEndpoint(placeable as Wall, this.#toWorld(event));
      if (index !== null) {
        this.#session = { kind: "endpoint", wall: placeable as Wall, index };
        return;
      }
    }
    if (placeable.document.documentName === "Tile" || placeable.document.documentName === "Token") {
      const target = placeable as Tile | Token;
      const world = this.#toWorld(event);
      if (typeof (target as any).grabsRotateHandle === "function" && (target as any).grabsRotateHandle(world)) {
        const bounds = target.bounds;
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        this.#session = { kind: "rotate", target, center, initialRotation: Number(target.document.rotation) || 0 };
        return;
      }
      if (typeof (target as any).grabsResizeHandle === "function" && (target as any).grabsResizeHandle(world)) {
        const bounds = target.bounds;
        const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const initialWidth = bounds.width;
        const initialHeight = bounds.height;
        const initialRatio = Math.max(0.01, initialWidth / Math.max(0.01, initialHeight));
        this.#session = {
          kind: "resize",
          target,
          initialWidth,
          initialHeight,
          initialRatio,
          center,
        };
        return;
      }
    }
    const pool = placeable.controlled ? (placeable.layer.controlled as PlaceableObject[]) : [placeable];
    const objects = pool.filter((object) => object.canDrag());
    if (objects.length === 0) return;
    if (this.#activeTool() === "stepRuler" && placeable.document.documentName === "Token") {
      if (!this.#stepRulerState || this.#stepRulerState.tokenId !== placeable.id) {
        this.initStepRuler(placeable as Token);
      }
    }
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
    const selectedEnd = tool?.documentName === "Wall" ? this.#selectedWallEndpoint(world) : null;
    if (selectedEnd) {
      this.#session = { kind: "endpoint", ...selectedEnd };
      return;
    }
    if (tool && this.#mayCreate(tool.documentName)) {
      const origin = event.shiftKey ? world : this.canvas.grid.getSnappedPoint(world, { mode: tool.snapMode });
      this.#session = { kind: "create", origin, tool, points: [world.x, world.y], startedAt: performance.now() };
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
      case "move": {
        const isStepRuler = this.#activeTool() === "stepRuler";
        const first = session.objects[0];
        if (isStepRuler && first && first.document.documentName === "Token") {
          const token = first as Token;
          const deltaX = world.x - session.origin.x;
          const deltaY = world.y - session.origin.y;
          const rawDest = { x: token.document.x + deltaX, y: token.document.y + deltaY };
          const snappedDest = this.canvas.grid.isGridless
            ? rawDest
            : this.canvas.grid.getSnappedPoint(rawDest, { mode: token.snapMode ?? "corner" });
          const snappedDeltaX = snappedDest.x - token.document.x;
          const snappedDeltaY = snappedDest.y - token.document.y;

          for (const object of session.objects) object.previewOffset(snappedDeltaX, snappedDeltaY);
          this.#announceTokenDrag(session.objects, false);

          const currentCenter = {
            x: snappedDest.x + token.w / 2,
            y: snappedDest.y + token.h / 2,
          };
          this.stepRulerTrackMovement(currentCenter);
          break;
        }

        for (const object of session.objects) object.previewOffset(world.x - session.origin.x, world.y - session.origin.y);
        this.#announceTokenDrag(session.objects, false);
        if (this.#pathModeActive) {
          this.#previewTokenPath(session.objects[0], world.x - session.origin.x, world.y - session.origin.y, !event.shiftKey);
        } else {
          this.#clearOverlay();
        }
        break;
      }
      case "create":
        this.#previewCreation(session, world, event.shiftKey);
        break;
      case "select":
        this.#drawOverlay((graphics) => graphics.lineStyle(2, 0x3b82f6, 1).beginFill(0x3b82f6, 0.1).drawRect(Math.min(session.origin.x, world.x), Math.min(session.origin.y, world.y), Math.abs(world.x - session.origin.x), Math.abs(world.y - session.origin.y)).endFill());
        break;
      case "ruler":
        this.#previewRuler(session.origin, this.canvas.grid.getSnappedPoint(world, { mode: "center" }));
        break;
      case "endpoint":
        this.#previewEndpoint(session, this.#wallPoint(world, event.shiftKey));
        break;
      case "resize":
        this.#previewResize(session.target, this.#resizedArea(session, world, event.altKey, event.shiftKey));
        break;
      case "rotate":
        this.#previewRotate(session.target, session.center, world, event.shiftKey);
        break;
    }
  }

  /**
   * Resizes keeping aspect ratio by default (no distortion), unless distortAllowed (Alt) is active.
   * Free smooth scaling by default for tokens and when Shift is held for tiles.
   */
  #resizedArea(
    session: { target: Tile | Token; initialWidth: number; initialHeight: number; initialRatio: number; center: Point },
    world: Point,
    distortAllowed: boolean,
    freeSnapping: boolean
  ): { width: number; height: number } {
    const rotation = Number(session.target.document.rotation) || 0;
    const rad = (-rotation * Math.PI) / 180;
    const dx = world.x - session.center.x;
    const dy = world.y - session.center.y;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const rawW = localX + session.initialWidth / 2;
    const rawH = localY + session.initialHeight / 2;

    let computedW: number;
    let computedH: number;

    if (distortAllowed) {
      computedW = Math.max(10, rawW);
      computedH = Math.max(10, rawH);
    } else {
      const lenSq = session.initialWidth * session.initialWidth + session.initialHeight * session.initialHeight;
      const dot = (rawW * session.initialWidth + rawH * session.initialHeight) / Math.max(1, lenSq);
      const scale = Math.max(0.05, dot);
      computedW = Math.max(10, session.initialWidth * scale);
      computedH = Math.max(10, session.initialHeight * scale);
    }

    const gridSize = this.canvas.grid.size;

    if (session.target.document.documentName === "Token") {
      const rawGridW = computedW / gridSize;
      const step = freeSnapping ? 0.01 : 0.05;
      const gridW = Math.max(0.1, Math.round(rawGridW / step) * step);
      const gridH = distortAllowed
        ? Math.max(0.1, Math.round((computedH / gridSize) / step) * step)
        : Math.max(0.1, Math.round((gridW / session.initialRatio) * 100) / 100);
      return { width: Math.round(gridW * 100) / 100, height: Math.round(gridH * 100) / 100 };
    }

    const quarter = Math.round(gridSize / 4);
    if (!freeSnapping) {
      const snappedW = Math.max(quarter, Math.round(computedW / quarter) * quarter);
      const snappedH = distortAllowed
        ? Math.max(quarter, Math.round(computedH / quarter) * quarter)
        : Math.max(quarter, Math.round(snappedW / session.initialRatio));
      return { width: snappedW, height: snappedH };
    }

    const snappedW = Math.max(quarter, Math.round(computedW));
    const snappedH = distortAllowed
      ? Math.max(quarter, Math.round(computedH))
      : Math.max(quarter, Math.round(snappedW / session.initialRatio));
    return { width: snappedW, height: snappedH };
  }

  #previewResize(target: Tile | Token, area: { width: number; height: number }): void {
    target.previewSize = area;
    target.refresh();
    const size = this.canvas.grid.size;
    if (target.document.documentName === "Token") {
      const squares = (value: number) => String(Math.round(value * 100) / 100).replace(".", ",");
      this.label.text = `${squares(area.width)} × ${squares(area.height)}`;
      this.label.position.set(target.position.x + (area.width * size) / 2, target.position.y + area.height * size);
    } else {
      const { x, y } = target.document;
      const squares = (value: number) => String(Math.round((value / size) * 100) / 100).replace(".", ",");
      this.label.text = `${squares(area.width)} × ${squares(area.height)}`;
      this.label.position.set(x + area.width / 2, y + area.height);
    }
    this.label.visible = true;
  }

  async #commitResize(target: Tile | Token, area: { width: number; height: number }): Promise<void> {
    try {
      if (!target.destroyed) {
        if (target.document.documentName === "Token") {
          const currentW = Number(target.document.width);
          const currentH = Number(target.document.height);
          if (area.width !== currentW || area.height !== currentH) {
            await target.document.update({ width: area.width, height: area.height });
          }
        } else {
          const currentW = Number(target.document.width);
          const currentH = Number(target.document.height);
          if (area.width !== currentW || area.height !== currentH) {
            await target.document.update(area);
          }
        }
      }
    } catch {
      currentUi()?.notifications?.warn("Não foi possível mudar o tamanho.");
    } finally {
      target.previewSize = null;
      this.label.visible = false;
      if (!target.destroyed) target.refresh();
    }
  }

  #previewRotate(target: Tile | Token, center: Point, world: Point, snap: boolean): void {
    const rad = Math.atan2(world.y - center.y, world.x - center.x);
    let deg = Math.round((rad * 180) / Math.PI + 90);
    deg = ((deg % 360) + 360) % 360;
    if (snap) {
      const step = 15;
      deg = (Math.round(deg / step) * step) % 360;
    }
    target.previewRotation = deg;
    target.refresh();
    this.label.text = `${deg}°`;
    this.label.position.set(center.x, center.y);
    this.label.visible = true;
  }

  async #commitRotate(target: Tile | Token, angle: number): Promise<void> {
    try {
      if (!target.destroyed && angle !== Number(target.document.rotation)) {
        await target.document.update({ rotation: angle });
      }
    } catch {
      currentUi()?.notifications?.warn("Não foi possível mudar a rotação.");
    } finally {
      target.previewRotation = null;
      this.label.visible = false;
      if (!target.destroyed) target.refresh();
    }
  }

  /** An end of a selected wall under the pointer, even when an unselected wall sharing that point is drawn on top. */
  #selectedWallEndpoint(world: Point): { wall: Wall; index: 0 | 1 } | null {
    for (const wall of (this.canvas.walls?.controlled ?? []) as Wall[]) {
      const index = this.#grabbedEndpoint(wall, world);
      if (index !== null && wall.canDrag()) return { wall, index };
    }
    return null;
  }

  #grabbedEndpoint(wall: Wall, world: Point): 0 | 1 | null {
    if (!wall.controlled) return null;
    const [ax, ay, bx, by] = wall.coords;
    const reach = ENDPOINT_GRAB_PX / (this.canvas.stage.scale.x || 1);
    if (Math.hypot(world.x - ax, world.y - ay) <= reach) return 0;
    if (Math.hypot(world.x - bx, world.y - by) <= reach) return 1;
    return null;
  }

  #wallPoint(world: Point, free: boolean): Point {
    return free ? world : this.canvas.grid.getSnappedPoint(world, { mode: WALL_SNAP_MODE });
  }

  #endpointCoords(session: Extract<Session, { kind: "endpoint" }>, point: Point): number[] {
    const coords = [...session.wall.coords];
    coords[session.index * 2] = point.x;
    coords[session.index * 2 + 1] = point.y;
    return coords.map(Math.round);
  }

  #previewEndpoint(session: Extract<Session, { kind: "endpoint" }>, point: Point): void {
    const [ax, ay, bx, by] = this.#endpointCoords(session, point);
    session.wall.alpha = GHOST_ALPHA;
    this.#drawOverlay((graphics) => {
      graphics.lineStyle(4, 0x3b82f6, 1).moveTo(ax, ay).lineTo(bx, by);
      graphics.lineStyle(0).beginFill(0x3b82f6).drawCircle(ax, ay, 6).drawCircle(bx, by, 6).endFill();
    });
  }

  async #commitEndpoint(session: Extract<Session, { kind: "endpoint" }>, point: Point): Promise<void> {
    const wall = session.wall;
    if (wall.destroyed) return;
    wall.alpha = 1;
    const c = this.#endpointCoords(session, point);
    const unchanged = c.every((value, index) => value === Math.round(wall.coords[index] ?? 0));
    if (unchanged || (c[0] === c[2] && c[1] === c[3])) {
      wall.refresh();
      return;
    }
    try {
      await wall.document.update({ c });
    } catch {
      if (!wall.destroyed) wall.refresh();
    }
  }

  #previewCreation(session: Extract<Session, { kind: "create" }>, world: Point, freeSnap: boolean): void {
    const lastX = session.points[session.points.length - 2];
    const lastY = session.points[session.points.length - 1];
    if (Math.hypot(world.x - lastX, world.y - lastY) >= FREEHAND_SAMPLE_PX) session.points.push(world.x, world.y);
    const destination = freeSnap ? world : this.canvas.grid.getSnappedPoint(world, { mode: session.tool.snapMode });
    this.#drawOverlay((graphics) => paintCreationPreview(graphics, session.tool, session.origin, destination, this.#creationContext(false), session.points, defaultDrawingColor()));
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
        this.#announceTokenDrag(session.objects, true);
        void this.#commitMove(session.objects, world.x - session.origin.x, world.y - session.origin.y, this.#activeTool() === "stepRuler" || !event.shiftKey, this.#pathModeActive);
        break;
      case "create":
        void this.#commitCreation(session, event.shiftKey ? world : this.canvas.grid.getSnappedPoint(world, { mode: session.tool.snapMode }), world);
        break;
      case "select":
        this.#commitSelection(session.origin, world, session.additive);
        break;
      case "endpoint":
        void this.#commitEndpoint(session, this.#wallPoint(world, event.shiftKey));
        break;
      case "resize":
        void this.#commitResize(session.target, this.#resizedArea(session, world, event.altKey, event.shiftKey));
        break;
      case "rotate":
        void this.#commitRotate(session.target, session.target.previewRotation ?? session.initialRotation);
        break;
      case "pan":
        this.#openBoardMenuOnRightClick(session, event, world);
        break;
      default:
        break;
    }
  }

  /** Lets the client share where dragged tokens are right now (`ended` once the pointer is released). */
  #announceTokenDrag(objects: PlaceableObject[], ended: boolean): void {
    const tokens = objects.filter((object) => object.document.documentName === "Token" && !object.destroyed);
    if (tokens.length === 0) return;
    Hooks.callAll("dragTokenPreview", tokens.map((token) => ({ tokenId: token.id, x: Math.round(token.position.x), y: Math.round(token.position.y) })), ended);
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

  /** Hold tools need a deliberate press: held long enough and dragged across at least half a grid square. */
  #isDeliberateDrag(session: Extract<Session, { kind: "create" }>, destination: Point): boolean {
    if (performance.now() - session.startedAt < HOLD_TO_CREATE_MS) return false;
    const grid = this.canvas.grid;
    const minimumLength = grid.isGridless ? session.tool.minimumDrag : grid.size / 2;
    return Math.hypot(destination.x - session.origin.x, destination.y - session.origin.y) >= minimumLength;
  }

  async #commitCreation(session: Extract<Session, { kind: "create" }>, destination: Point, world: Point): Promise<void> {
    const dragged = Math.hypot(world.x - session.origin.x, world.y - session.origin.y);
    if (dragged < session.tool.minimumDrag) return;
    if (session.tool.requiresHold && !this.#isDeliberateDrag(session, destination)) return;
    const data = session.tool.build(session.origin, destination, this.#creationContext(true), session.points);
    if (!data) return;
    const prepared = await this.canvas.hud.prepareCreation(session.tool.documentName, data);
    if (!prepared) return;
    await this.canvas.scene.createEmbeddedDocuments(session.tool.documentName, [prepared]);
  }

  #onWheel(event: WheelEvent): void {
    if (!this.canvas.ready) return;
    if (event.shiftKey || event.ctrlKey) {
      if (this.#handleRotateWheel(event)) return;
    }
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

  #getTargetPlaceables(): PlaceableObject[] {
    const layer = this.canvas.activeLayer;
    let targets: PlaceableObject[] = ((layer?.controlled ?? []) as PlaceableObject[]).filter((o) => o.canDrag());
    if (targets.length === 0) {
      const hovered = ((layer?.placeables ?? []) as PlaceableObject[]).find((p) => p.hover && p.canDrag());
      if (hovered) targets = [hovered];
    }
    if (targets.length === 0) {
      const tileHovered = ((this.canvas.tiles?.placeables ?? []) as Tile[]).find((t) => t.hover && t.canDrag());
      if (tileHovered) targets = [tileHovered];
      else {
        const tokenHovered = ((this.canvas.tokens?.placeables ?? []) as Token[]).find((t) => t.hover && t.canDrag());
        if (tokenHovered) targets = [tokenHovered];
      }
    }
    return targets;
  }

  async #flipSelected(axis: "horizontal" | "vertical"): Promise<void> {
    const targets = this.#getTargetPlaceables();
    if (targets.length === 0) return;
    const property = axis === "horizontal" ? "texture.scaleX" : "texture.scaleY";
    for (const object of targets) {
      const current = axis === "horizontal" ? Number(object.document.texture?.scaleX ?? 1) : Number(object.document.texture?.scaleY ?? 1);
      const next = current < 0 ? 1 : -1;
      await object.document.update({ [property]: next });
    }
  }

  #handleRotateWheel(event: WheelEvent): boolean {
    const targets = this.#getTargetPlaceables();
    if (targets.length === 0) return false;

    event.preventDefault();
    const step = event.altKey ? 15 : 45;
    const delta = event.deltaY < 0 ? step : -step;
    for (const object of targets) {
      const current = Number(object.document.rotation) || 0;
      const next = ((Math.round((current + delta) / step) * step % 360) + 360) % 360;
      void object.document.update({ rotation: next });
    }
    return true;
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
      if (this.#activeTool() === "stepRuler" && this.#stepRulerState) {
        this.resetStepRuler();
        return;
      }
      this.canvas.activeLayer?.releaseAll?.();
    } else if (event.key === "h" || event.key === "H") {
      event.preventDefault();
      void this.#flipSelected("horizontal");
    } else if (event.key === "v" || event.key === "V") {
      event.preventDefault();
      void this.#flipSelected("vertical");
    } else if (event.key === "r" || event.key === "R" || event.key === "[" || event.key === "]") {
      const targets = this.#getTargetPlaceables();
      if (targets.length > 0) {
        event.preventDefault();
        const step = event.altKey ? 15 : 45;
        const delta = (event.key === "R" || event.key === "[") ? -step : step;
        for (const object of targets) {
          const current = Number(object.document.rotation) || 0;
          const next = ((Math.round((current + delta) / step) * step % 360) + 360) % 360;
          void object.document.update({ rotation: next });
        }
      }
    }
  }

  async #onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.canvas.ready) return;
    const raw = event.dataTransfer?.getData("text/plain") ?? "";
    const rect = (this.canvas.app.view as HTMLCanvasElement).getBoundingClientRect();
    const world = (this.canvas.stage as PIXI.Container).toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!raw && files.length > 0) {
      Hooks.callAll("dropCanvasFiles", this.canvas, files, { x: world.x, y: world.y, free: event.shiftKey });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const dropData = { ...(data as PlainObject), x: world.x, y: world.y, free: event.shiftKey };
    if (Hooks.call("dropCanvasData", this.canvas, dropData, event) === false) return;
    await handleCanvasDrop(this.canvas, dropData);
  }

  get stepRulerState(): { tokenId: string; waypoints: Point[]; lastCell: { i: number; j: number }; totalSteps: number; totalDistance: number } | null {
    return this.#stepRulerState;
  }

  get #controlledToken(): Token | null {
    const controlled = (this.canvas.tokens?.controlled ?? []) as Token[];
    return controlled[0] ?? null;
  }

  initStepRuler(token?: Token): void {
    const target = token ?? this.#controlledToken;
    if (!target || target.destroyed) {
      this.clearStepRuler();
      return;
    }
    const grid = this.canvas.grid;
    let startX = target.document.x;
    let startY = target.document.y;
    if (!grid.isGridless) {
      const snapped = grid.getSnappedPoint({ x: target.document.x, y: target.document.y }, { mode: target.snapMode ?? "corner" });
      if (snapped.x !== target.document.x || snapped.y !== target.document.y) {
        startX = snapped.x;
        startY = snapped.y;
        target.position?.set?.(snapped.x, snapped.y);
        if (typeof target.document?.update === "function" && (target.canDrag?.() || currentGame()?.user?.isGM)) {
          void target.document.update({ x: snapped.x, y: snapped.y });
        }
      }
    }
    const center = { x: startX + target.w / 2, y: startY + target.h / 2 };
    const cell = grid.getOffset(center);
    const startPoint = grid.isGridless ? center : grid.getCenterPoint(cell);
    this.#stepRulerState = {
      tokenId: target.id,
      waypoints: [startPoint],
      lastCell: cell,
      totalSteps: 0,
      totalDistance: 0,
    };
    this.#renderStepRuler();
  }

  resetStepRuler(): void {
    const state = this.#stepRulerState;
    if (!state) return;
    const token = (this.canvas.tokens?.placeables ?? []).find((t: PlaceableObject) => t.id === state.tokenId) as Token | undefined;
    if (token && !token.destroyed) {
      this.initStepRuler(token);
    } else {
      this.clearStepRuler();
    }
  }

  clearStepRuler(): void {
    this.#stepRulerState = null;
    this.stepRulerOverlay.clear();
    this.stepRulerLabel.visible = false;
  }

  stepRulerTrackMovement(center: Point): void {
    const state = this.#stepRulerState;
    if (!state || this.#activeTool() !== "stepRuler") return;
    const grid = this.canvas.grid;

    if (grid.isGridless) {
      const lastPoint = state.waypoints[state.waypoints.length - 1];
      const dist = Math.hypot(center.x - lastPoint.x, center.y - lastPoint.y);
      const minStep = Math.max(10, grid.size / 3);
      if (dist >= minStep) {
        state.waypoints.push({ x: center.x, y: center.y });
        state.totalDistance += (dist / grid.size) * grid.distance;
        state.totalSteps = Math.round((state.totalDistance / grid.distance) * 10) / 10;
        this.#renderStepRuler();
      }
      return;
    }

    const currentCell = grid.getOffset(center);
    const lastCell = state.lastCell;
    if (currentCell.i === lastCell.i && currentCell.j === lastCell.j) return;

    const di = currentCell.i - lastCell.i;
    const dj = currentCell.j - lastCell.j;
    const stepsCount = Math.max(Math.abs(di), Math.abs(dj));

    let curI = lastCell.i;
    let curJ = lastCell.j;

    for (let s = 1; s <= stepsCount; s++) {
      const targetI = Math.round(lastCell.i + (di * s) / stepsCount);
      const targetJ = Math.round(lastCell.j + (dj * s) / stepsCount);
      if (targetI === curI && targetJ === curJ) continue;
      curI = targetI;
      curJ = targetJ;
      state.totalSteps += 1;
      state.totalDistance += grid.distance;
      state.waypoints.push(grid.getCenterPoint({ i: curI, j: curJ }));
    }

    state.lastCell = currentCell;
    this.#renderStepRuler();
  }

  #renderStepRuler(): void {
    const state = this.#stepRulerState;
    if (!state || this.#activeTool() !== "stepRuler" || state.waypoints.length === 0) {
      this.stepRulerOverlay.clear();
      this.stepRulerLabel.visible = false;
      return;
    }

    const color = colorToNumber(currentGame()?.user?.color, 0x3b82f6);
    const waypoints = state.waypoints;

    this.stepRulerOverlay.clear();
    const g = this.stepRulerOverlay;

    if (waypoints.length > 1) {
      g.lineStyle(8, 0x000000, 0.55);
      g.moveTo(waypoints[0].x, waypoints[0].y);
      for (let i = 1; i < waypoints.length; i++) {
        g.lineTo(waypoints[i].x, waypoints[i].y);
      }

      g.lineStyle(4, color, 0.95);
      g.moveTo(waypoints[0].x, waypoints[0].y);
      for (let i = 1; i < waypoints.length; i++) {
        g.lineTo(waypoints[i].x, waypoints[i].y);
      }
    }

    for (let i = 0; i < waypoints.length; i++) {
      const p = waypoints[i];
      if (i === 0) {
        g.lineStyle(3, 0x10b981, 1).beginFill(0x000000, 0.6).drawCircle(p.x, p.y, 8).endFill();
        g.lineStyle(0).beginFill(0x10b981, 1).drawCircle(p.x, p.y, 4).endFill();
      } else if (i === waypoints.length - 1) {
        g.lineStyle(3, 0xffffff, 1).beginFill(color, 1).drawCircle(p.x, p.y, 8).endFill();
      } else {
        g.lineStyle(2, 0x000000, 0.6).beginFill(color, 0.8).drawCircle(p.x, p.y, 5).endFill();
      }
    }

    const last = waypoints[waypoints.length - 1];
    const grid = this.canvas.grid;
    const units = this.canvas.dimensions?.units ? ` ${this.canvas.dimensions.units}` : "";
    const distStr = String(Math.round(state.totalDistance * 100) / 100).replace(".", ",");
    const squareStr = state.totalSteps === 1 ? "quadrado" : "quadrados";

    this.stepRulerLabel.text = `${state.totalSteps} ${squareStr} (${distStr}${units})`;
    this.stepRulerLabel.position.set(last.x, last.y - (grid.size / 2 + 12));
    this.stepRulerLabel.visible = true;
  }
}
