import * as PIXI from "pixi.js";
import type { Rectangle } from "../geometry";
import type { PlaceableObject } from "../placeables/PlaceableObject";
import { loadTexture } from "../textures";
import { parseStoredMemory, reconcileSightMemory, serializeMemory, type PresentObject, type RememberedLook } from "./sightMemoryRules";

const STORAGE_PREFIX = "tabbletop.sight";
const SAVE_DELAY_MS = 4000;
const GHOST_ALPHA = 0.5;
const DEFAULT_NOTE_ICON = "icons/svg/book.svg";

type RememberedKind = RememberedLook["documentName"];

/** Placeables whose last-seen look is remembered; `isRevealed` says whether the player may see them at all. */
interface MemorablePlaceable extends PlaceableObject {
  isRevealed: boolean;
}

function lookOf(placeable: PlaceableObject, documentName: RememberedKind): RememberedLook {
  const document = placeable.document;
  const bounds = placeable.bounds;
  const src = String(document.texture?.src ?? (documentName === "Note" ? DEFAULT_NOTE_ICON : ""));
  return { documentName, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, rotation: Number(document.rotation) || 0, alpha: Number(document.alpha ?? 1), src };
}

/**
 * Each player's visual memory of tiles (map objects, loot, traps) and notes on one scene. Out of sight the player sees
 * them as they were last seen, faded; what changed meanwhile only shows when it comes into view again.
 */
export class SightMemory {
  readonly #storageKey: string;
  readonly #memory: Map<string, RememberedLook>;
  readonly #persist: boolean;
  #outOfSight = new Set<string>();
  #ghostLayers = new Map<RememberedKind, PIXI.Container>();
  #ghostSignature = "";
  #ghostGeneration = 0;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sceneId: string, userId: string, persist: boolean) {
    this.#storageKey = `${STORAGE_PREFIX}.${sceneId}.${userId}`;
    this.#persist = persist;
    this.#memory = persist ? parseStoredMemory(this.#read()) : new Map();
  }

  isOutOfSight(placeable: PlaceableObject): boolean {
    return this.#outOfSight.has(`${placeable.document.documentName}.${placeable.id}`);
  }

  update(canvas: any, isAreaInSight: (area: Rectangle) => boolean): void {
    const present = new Map<string, PresentObject>();
    const placeables: MemorablePlaceable[] = [];
    for (const [documentName, layer] of [["Tile", canvas.tiles], ["Note", canvas.notes]] as const) {
      for (const placeable of (layer?.placeables ?? []) as MemorablePlaceable[]) {
        placeables.push(placeable);
        if (!placeable.isRevealed) continue;
        present.set(`${documentName}.${placeable.id}`, { look: lookOf(placeable, documentName), inSight: placeable.document.global === true || isAreaInSight(placeable.bounds) });
      }
    }
    const memory = this.#persist ? this.#memory : new Map<string, RememberedLook>();
    const result = reconcileSightMemory(memory, present, (look) => isAreaInSight(look));
    this.#outOfSight = new Set([...present.keys()].filter((key) => !result.shown.has(key)));
    for (const placeable of placeables) placeable.visible = placeable.isVisible;
    this.#drawGhosts(canvas, result.ghosts);
    if (result.changed && this.#persist) this.#scheduleSave();
  }

  /** Fog is off (or the GM is looking): everything shows as it really is. */
  release(canvas: any): void {
    if (this.#outOfSight.size === 0 && this.#ghostSignature === "") return;
    this.#outOfSight.clear();
    for (const layer of [canvas.tiles, canvas.notes]) for (const placeable of layer?.placeables ?? []) placeable.visible = placeable.isVisible;
    this.#drawGhosts(canvas, []);
  }

  destroy(): void {
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
      this.#saveTimer = null;
      this.#save();
    }
    for (const container of this.#ghostLayers.values()) container.destroy({ children: true });
    this.#ghostLayers.clear();
  }

  #ghostLayer(canvas: any, documentName: RememberedKind): PIXI.Container | null {
    const layer = documentName === "Tile" ? canvas.tiles : canvas.notes;
    if (!layer) return null;
    let container = this.#ghostLayers.get(documentName);
    if (!container || container.destroyed) {
      container = new PIXI.Container();
      container.eventMode = "none";
      this.#ghostLayers.set(documentName, container);
    }
    if (container.parent !== layer) layer.addChildAt(container, 0);
    return container;
  }

  #drawGhosts(canvas: any, ghosts: Array<[string, RememberedLook]>): void {
    const signature = ghosts.map(([key, look]) => `${key}:${look.x},${look.y},${look.width},${look.height},${look.rotation},${look.src}`).join("|");
    if (signature === this.#ghostSignature && [...this.#ghostLayers.values()].every((container) => !container.destroyed && container.parent)) return;
    this.#ghostSignature = signature;
    const generation = ++this.#ghostGeneration;
    for (const documentName of ["Tile", "Note"] as const) this.#ghostLayer(canvas, documentName)?.removeChildren().forEach((child) => child.destroy());
    for (const [, look] of ghosts) void this.#addGhost(canvas, look, generation);
  }

  async #addGhost(canvas: any, look: RememberedLook, generation: number): Promise<void> {
    const texture = look.src ? await loadTexture(look.src) : null;
    const container = this.#ghostLayer(canvas, look.documentName);
    if (!texture || !container || generation !== this.#ghostGeneration) return;
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = look.width;
    sprite.height = look.height;
    sprite.position.set(look.x + look.width / 2, look.y + look.height / 2);
    sprite.angle = look.rotation;
    sprite.alpha = look.alpha * GHOST_ALPHA;
    container.addChild(sprite);
  }

  #scheduleSave(): void {
    if (this.#saveTimer) return;
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      this.#save();
    }, SAVE_DELAY_MS);
  }

  #save(): void {
    try {
      localStorage.setItem(this.#storageKey, serializeMemory(this.#memory));
    } catch {
      /* quota exceeded: the memory simply is not persisted */
    }
  }

  #read(): string | null {
    try {
      return localStorage.getItem(this.#storageKey);
    } catch {
      return null;
    }
  }
}
