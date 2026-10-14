import * as PIXI from "pixi.js";
import { Hooks } from "../../hooks/Hooks";
import { currentCanvas, currentConfig, currentGame } from "../../runtime";
import type { Rectangle } from "../geometry";
import type { PlaceableObject } from "../placeables/PlaceableObject";

export interface LayerOptions {
  name: string;
  zIndex: number;
}

export class CanvasLayer extends PIXI.Container {
  static layerOptions: LayerOptions = { name: "", zIndex: 0 };

  constructor() {
    super();
    this.name = (new.target as typeof CanvasLayer).layerOptions.name;
  }

  get options(): LayerOptions {
    return (this.constructor as typeof CanvasLayer).layerOptions;
  }

  get hookName(): string {
    return this.constructor.name;
  }

  async draw(): Promise<this> {
    await this._draw();
    Hooks.callAll(`draw${this.hookName}`, this);
    return this;
  }

  protected async _draw(): Promise<void> {}

  async tearDown(): Promise<this> {
    for (const child of this.removeChildren()) child.destroy({ children: true });
    Hooks.callAll(`tearDown${this.hookName}`, this);
    return this;
  }
}

/** A layer the user can switch to through the scene controls; only the active one receives pointer input. */
export class InteractionLayer extends CanvasLayer {
  active = false;

  activate({ tool }: { tool?: string } = {}): this {
    const canvas = currentCanvas();
    if (canvas?.activeLayer && canvas.activeLayer !== this) canvas.activeLayer.deactivate();
    this.active = true;
    if (canvas) canvas.activeLayer = this;
    this._activate();
    Hooks.callAll(`activate${this.hookName}`, this, tool);
    return this;
  }

  deactivate(): this {
    if (!this.active) return this;
    this.active = false;
    this._deactivate();
    Hooks.callAll(`deactivate${this.hookName}`, this);
    return this;
  }

  protected _activate(): void {}
  protected _deactivate(): void {}
}

export abstract class PlaceablesLayer extends InteractionLayer {
  static documentName = "";
  readonly objects = new PIXI.Container();
  readonly preview = new PIXI.Container();
  readonly controlledObjects = new Map<string, PlaceableObject>();

  get documentName(): string {
    return (this.constructor as typeof PlaceablesLayer).documentName;
  }

  get documentCollection(): any {
    return currentCanvas()?.scene?.getEmbeddedCollection(this.documentName) ?? null;
  }

  get placeables(): PlaceableObject[] {
    return this.objects.children as PlaceableObject[];
  }

  get controlled(): PlaceableObject[] {
    return Array.from(this.controlledObjects.values());
  }

  get objectClass(): any {
    return currentConfig()?.[this.documentName]?.objectClass;
  }

  get(objectId: string): PlaceableObject | undefined {
    return this.documentCollection?.get(objectId)?._object ?? undefined;
  }

  protected override async _draw(): Promise<void> {
    this.objects.sortableChildren = true;
    this.addChild(this.objects, this.preview);
    this.objects.eventMode = "passive";
    this.preview.eventMode = "none";
    this.objects.interactiveChildren = this.active;
    const documents = this.documentCollection?.contents ?? [];
    await Promise.all(documents.map((document: any) => this.createObject(document)));
  }

  override async tearDown(): Promise<this> {
    this.controlledObjects.clear();
    for (const placeable of this.placeables) placeable.document._object = null;
    this.objects.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.preview.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.removeChildren();
    Hooks.callAll(`tearDown${this.hookName}`, this);
    return this;
  }

  async createObject(document: any): Promise<PlaceableObject | null> {
    const ObjectClass = this.objectClass;
    if (!ObjectClass) return null;
    const placeable = new ObjectClass(document) as PlaceableObject;
    placeable.zIndex = Number(document.sort) || 0;
    this.objects.addChild(placeable);
    await placeable.draw();
    currentCanvas()?.perception?.update?.();
    return placeable;
  }

  protected override _deactivate(): void {
    this.releaseAll();
    this.objects.interactiveChildren = false;
    for (const placeable of this.placeables) placeable.refresh();
  }

  protected override _activate(): void {
    this.objects.interactiveChildren = true;
    for (const placeable of this.placeables) placeable.refresh();
  }

  releaseAll({ except }: { except?: PlaceableObject } = {}): number {
    let released = 0;
    for (const placeable of this.controlled) {
      if (placeable === except) continue;
      placeable.release();
      released += 1;
    }
    return released;
  }

  controlAll(): PlaceableObject[] {
    for (const placeable of this.placeables) placeable.control({ releaseOthers: false });
    return this.controlled;
  }

  selectObjects(area: Rectangle, { releaseOthers = true }: { releaseOthers?: boolean } = {}): boolean {
    if (releaseOthers) this.releaseAll();
    let changed = false;
    for (const placeable of this.placeables) {
      if (!placeable.visible) continue;
      const { x, y } = placeable.center;
      const inside = x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
      if (inside && placeable.control({ releaseOthers: false })) changed = true;
    }
    return changed;
  }

  /** Deletes controlled objects the user owns; returns the ids sent to the server. */
  async deleteControlled(): Promise<string[]> {
    const user = currentGame()?.user;
    const ids = this.controlled.filter((placeable) => placeable.document.canUserModify?.(user, "delete")).map((placeable) => placeable.id);
    if (ids.length === 0) return [];
    await currentCanvas().scene.deleteEmbeddedDocuments(this.documentName, ids);
    return ids;
  }

  async updateAll(updates: Array<Record<string, unknown>>): Promise<unknown> {
    if (updates.length === 0) return [];
    return currentCanvas().scene.updateEmbeddedDocuments(this.documentName, updates);
  }
}
