import * as PIXI from "pixi.js";
import { currentConfig } from "../runtime";
import { BaseSamplerShader } from "./rendering";

/** Sprite that remembers a shader class; rendering itself goes through PIXI's default sprite batching. */
export class SpriteMesh extends PIXI.Sprite {
  #shaderClass: typeof BaseSamplerShader;

  constructor(texture?: PIXI.Texture | null, shaderClass: typeof BaseSamplerShader = BaseSamplerShader) {
    super(texture ?? PIXI.Texture.EMPTY);
    this.#shaderClass = shaderClass ?? BaseSamplerShader;
  }

  get shaderClass(): typeof BaseSamplerShader {
    return this.#shaderClass;
  }

  setShaderClass(shaderClass: typeof BaseSamplerShader): void {
    if (shaderClass) this.#shaderClass = shaderClass;
  }

  /** Foundry meshes expose texture padding; plain sprites have none. */
  get padding(): number {
    return 0;
  }

  getPixelAlpha(x: number, y: number): number {
    const local = this.toLocal({ x, y });
    return this.containsPoint(this.toGlobal(local)) ? 1 : 0;
  }
}

const TEXT_RESOLUTION_LIMIT = 4;

/** Text that renders at the device resolution so labels stay crisp while the board is zoomed. */
export class PreciseText extends PIXI.Text {
  constructor(text?: string, style?: Partial<PIXI.ITextStyle> | PIXI.TextStyle, canvas?: PIXI.ICanvas) {
    super(text ?? "", style, canvas);
    this.resolution = Math.min(Math.max(globalThis.devicePixelRatio || 1, 1) * 2, TEXT_RESOLUTION_LIMIT);
  }

  static getTextStyle({ anchor, ...options }: Partial<PIXI.ITextStyle> & { anchor?: number } = {}): PIXI.TextStyle {
    const base: PIXI.TextStyle | undefined = currentConfig()?.canvasTextStyle;
    const style = base?.clone?.() ?? new PIXI.TextStyle();
    for (const [key, value] of Object.entries(options)) if (value !== undefined) (style as any)[key] = value;
    if (anchor !== undefined) style.align = anchor === 0 ? "center" : "left";
    return style;
  }
}

/** Round handle drawn at a placeable's origin (templates, lights, sounds); `border` shows on hover. */
export class ControlIcon extends PIXI.Container {
  readonly size: number;
  readonly bg = new PIXI.Graphics();
  readonly icon: PIXI.Sprite;
  readonly border = new PIXI.Graphics();

  constructor({ texture, size = 40, borderColor = 0xff5500, tint = null }: { texture?: string | PIXI.Texture; size?: number; borderColor?: number; tint?: number | null } = {}) {
    super();
    this.size = size;
    this.bg.beginFill(0x000000, 0.4).lineStyle(2, 0x000000, 1).drawRoundedRect(0, 0, size, size, 5).endFill();
    const iconTexture = texture instanceof PIXI.Texture ? texture : texture ? PIXI.Texture.from(texture) : PIXI.Texture.EMPTY;
    this.icon = new PIXI.Sprite(iconTexture);
    this.icon.width = size;
    this.icon.height = size;
    if (tint !== null) this.icon.tint = tint;
    this.border.lineStyle(4, borderColor, 1).drawRoundedRect(-2, -2, size + 4, size + 4, 6);
    this.border.visible = false;
    this.addChild(this.bg, this.icon, this.border);
    this.pivot.set(size / 2, size / 2);
  }

  async draw(): Promise<this> {
    return this;
  }
}

export function createContainersNamespace() {
  return { SpriteMesh, PreciseText, ControlIcon };
}
