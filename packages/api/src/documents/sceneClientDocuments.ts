import { DOCUMENT_OWNERSHIP_LEVELS, getProperty, type PlainObject } from "@tabbletop/common";
import { currentCanvas, currentGame } from "../runtime";
import type { Document, DocumentOperation, UserLike } from "./abstract/Document";
import { ClientDocumentMixin } from "./abstract/ClientDocumentMixin";
import {
  BaseAmbientLight,
  BaseDrawing,
  BaseMeasuredTemplate,
  BaseNote,
  BaseScene,
  BaseTile,
  BaseToken,
  BaseWall,
} from "./sceneBaseDocuments";

type DocumentConstructor = abstract new (...args: any[]) => Document;

const SCENE_REDRAW_KEYS = ["background", "backgroundColor", "width", "height", "padding", "grid", "tokenVision", "fog", "environment"];

/** Links an embedded scene document to the placeable object drawn for it on the canvas. */
export function CanvasDocumentMixin<TBase extends DocumentConstructor>(BaseDocument: TBase) {
  abstract class CanvasDocument extends ClientDocumentMixin(BaseDocument) {
    declare _object: any;

    constructor(...args: any[]) {
      super(...args);
      Object.defineProperty(this, "_object", { value: null, writable: true, enumerable: false });
    }

    get layer(): any {
      return currentCanvas()?.getLayerByEmbeddedName?.(this.documentName) ?? null;
    }

    get object(): any {
      return this._object;
    }

    get rendered(): boolean {
      return Boolean(this._object);
    }

    override _onCreate(data: PlainObject, options: DocumentOperation, userId: string): void {
      super._onCreate(data, options, userId);
      if (this.parent?.isView) this.layer?.createObject?.(this);
    }

    override _onUpdate(changed: PlainObject, options: DocumentOperation, userId: string): void {
      super._onUpdate(changed, options, userId);
      this._object?._onUpdate?.(changed, options, userId);
    }

    override _onDelete(options: DocumentOperation, userId: string): void {
      super._onDelete(options, userId);
      this._object?._onDelete?.(options, userId);
    }
  }
  return CanvasDocument;
}

/** Drawings and templates belong to their author; everyone else sees them through the scene. */
function authoredLevel(document: any, user: UserLike, inheritedLevel: number): number {
  if (user && document._source.author === user.id) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return inheritedLevel;
}

export class TokenDocument extends CanvasDocumentMixin(BaseToken) {
  get actor(): any {
    const actorId = this._source.actorId as string | null;
    return actorId ? (currentGame()?.actors?.get(actorId) ?? null) : null;
  }

  get isLinked(): boolean {
    return this._source.actorLink === true;
  }

  get hasPlayerOwner(): boolean {
    return this.actor?.hasPlayerOwner ?? false;
  }

  /** A token is owned by whoever owns its actor, mirroring the server's permission policy. */
  override getUserLevel(user: UserLike = currentGame()?.user): number {
    const ownLevel = super.getUserLevel(user);
    const actorLevel = this.actor?.getUserLevel?.(user) ?? DOCUMENT_OWNERSHIP_LEVELS.NONE;
    return Math.max(ownLevel, actorLevel);
  }

  getBarAttribute(barName: "bar1" | "bar2"): { attribute: string; value: number; max: number } | null {
    const attribute = (this._source[barName] as PlainObject | undefined)?.attribute as string | null | undefined;
    if (!attribute || !this.actor) return null;
    const data = getProperty(this.actor.system ?? {}, attribute);
    if (data && typeof data === "object" && Number.isFinite(Number(data.value)) && Number.isFinite(Number(data.max))) {
      return { attribute, value: Number(data.value), max: Number(data.max) };
    }
    return null;
  }

  override getRollData(): PlainObject {
    return this.actor?.getRollData?.() ?? {};
  }
}

export class TileDocument extends CanvasDocumentMixin(BaseTile) {}

export class WallDocument extends CanvasDocumentMixin(BaseWall) {
  get isDoor(): boolean {
    return Number(this._source.door) > 0;
  }

  get isOpen(): boolean {
    return this.isDoor && Number(this._source.ds) === 1;
  }
}

export class AmbientLightDocument extends CanvasDocumentMixin(BaseAmbientLight) {}

export class NoteDocument extends CanvasDocumentMixin(BaseNote) {
  get entry(): any {
    const entryId = this._source.entryId as string | null;
    return entryId ? (currentGame()?.journal?.get(entryId) ?? null) : null;
  }

  get label(): string {
    return (this._source.text as string) || this.entry?.name || "";
  }
}

export class DrawingDocument extends CanvasDocumentMixin(BaseDrawing) {
  override getUserLevel(user: UserLike = currentGame()?.user): number {
    if (user?.isGM) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return authoredLevel(this, user, super.getUserLevel(user));
  }
}

export class MeasuredTemplateDocument extends CanvasDocumentMixin(BaseMeasuredTemplate) {
  override getUserLevel(user: UserLike = currentGame()?.user): number {
    if (user?.isGM) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return authoredLevel(this, user, super.getUserLevel(user));
  }
}

export class Scene extends ClientDocumentMixin(BaseScene) {
  get isView(): boolean {
    return currentCanvas()?.scene === this;
  }

  get thumbnail(): string | null {
    return (this._source.thumb as string | null) ?? (this._source.background as PlainObject | undefined)?.src as string | null ?? null;
  }

  /** The active scene is public to every player, mirroring the server's `publicWhenField`. */
  override getUserLevel(user: UserLike = currentGame()?.user): number {
    const level = super.getUserLevel(user);
    return this._source.active === true ? Math.max(level, DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) : level;
  }

  async view(): Promise<unknown> {
    return currentCanvas()?.draw?.(this);
  }

  async activate(): Promise<unknown> {
    return this.update({ active: true });
  }

  override _onCreate(data: PlainObject, options: DocumentOperation, userId: string): void {
    super._onCreate(data, options, userId);
    if (this._source.active === true) void this.view();
  }

  override _onUpdate(changed: PlainObject, options: DocumentOperation, userId: string): void {
    super._onUpdate(changed, options, userId);
    if (changed.active === true) {
      void this.view();
      return;
    }
    if (this.isView && SCENE_REDRAW_KEYS.some((key) => key in changed)) void this.view();
  }

  override _onDelete(options: DocumentOperation, userId: string): void {
    super._onDelete(options, userId);
    if (!this.isView) return;
    const fallback = currentGame()?.scenes?.find((scene: Scene) => scene !== this && scene.active) ?? null;
    void currentCanvas()?.draw?.(fallback);
  }
}
