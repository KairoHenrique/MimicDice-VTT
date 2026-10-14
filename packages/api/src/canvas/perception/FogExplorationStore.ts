import * as PIXI from "pixi.js";

const SAVE_DELAY_MS = 4000;
const MAX_STORED_LENGTH = 1_500_000;
const STORAGE_PREFIX = "tabbletop.fog";

/** Persists one user's explored-fog texture per scene in localStorage (an image only; no personal data). */
export class FogExplorationStore {
  readonly #storageKey: string;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    sceneId: string,
    userId: string,
    private readonly renderer: PIXI.Renderer,
    private readonly texture: PIXI.RenderTexture,
  ) {
    this.#storageKey = `${STORAGE_PREFIX}.${sceneId}.${userId}`;
  }

  async restore(): Promise<void> {
    const stored = this.#read();
    if (!stored) return;
    try {
      const image = await PIXI.Texture.fromURL(stored);
      const sprite = new PIXI.Sprite(image);
      sprite.width = this.texture.width;
      sprite.height = this.texture.height;
      this.renderer.render(sprite, { renderTexture: this.texture, clear: true });
      sprite.destroy();
      image.destroy(true);
    } catch {
      this.clear();
    }
  }

  scheduleSave(): void {
    if (this.#saveTimer) return;
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = null;
      void this.#save();
    }, SAVE_DELAY_MS);
  }

  flush(): void {
    if (!this.#saveTimer) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    void this.#save();
  }

  clear(): void {
    try {
      localStorage.removeItem(this.#storageKey);
    } catch {
      /* storage unavailable */
    }
  }

  async #save(): Promise<void> {
    if (this.texture.destroyed) return;
    try {
      const encoded = await this.renderer.extract.base64(this.texture, "image/webp", 0.7);
      if (encoded.length <= MAX_STORED_LENGTH) localStorage.setItem(this.#storageKey, encoded);
    } catch {
      /* quota exceeded or context lost: exploration simply is not persisted */
    }
  }

  #read(): string | null {
    try {
      const value = localStorage.getItem(this.#storageKey);
      return value?.startsWith("data:image/") ? value : null;
    } catch {
      return null;
    }
  }
}
