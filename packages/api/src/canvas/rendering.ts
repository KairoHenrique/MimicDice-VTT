import * as PIXI from "pixi.js";

type ShaderSource = string | ((...args: unknown[]) => string) | undefined;

function resolveSource(source: ShaderSource): string | undefined {
  return typeof source === "function" ? source() : source;
}

/**
 * Base for package filters. Subclasses declare static `defaultUniforms`, `vertexShader` and `fragmentShader`
 * and are instantiated through `create(initialUniforms)`.
 */
export class AbstractBaseFilter extends PIXI.Filter {
  static defaultUniforms: Record<string, unknown> = {};
  static vertexShader: ShaderSource = undefined;
  static fragmentShader: ShaderSource = undefined;

  static create<T extends AbstractBaseFilter>(this: new (vertex?: string, fragment?: string, uniforms?: Record<string, unknown>) => T, initialUniforms: Record<string, unknown> = {}): T {
    const filterClass = this as unknown as typeof AbstractBaseFilter & { _createFragmentShader?: () => string };
    const fragment = filterClass._createFragmentShader?.() ?? resolveSource(filterClass.fragmentShader);
    const uniforms = { ...structuredCloneUniforms(filterClass.defaultUniforms), ...initialUniforms };
    return new this(resolveSource(filterClass.vertexShader), fragment, uniforms);
  }
}

/** Arrays are copied so instances never share a uniform buffer; textures and other objects are shared on purpose. */
function structuredCloneUniforms(uniforms: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(uniforms ?? {}).map(([name, value]) => [name, Array.isArray(value) ? [...value] : ArrayBuffer.isView(value) ? (value as Float32Array).slice() : value]));
}

const DEFAULT_SAMPLER_VERTEX = `
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat3 projectionMatrix;
varying vec2 vUvs;
void main() {
  vUvs = aTextureCoord;
  gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}`;

const DEFAULT_SAMPLER_FRAGMENT = `
precision mediump float;
uniform sampler2D sampler;
uniform vec4 tintAlpha;
varying vec2 vUvs;
void main() {
  gl_FragColor = texture2D(sampler, vUvs) * tintAlpha;
}`;

/**
 * Shader base for sprite meshes. Tabbletop renders meshes through PIXI's default batch renderer, so custom
 * batch plugins are accepted (`registerPlugin`) but not used: effects draw normally, without vision masking.
 */
export class BaseSamplerShader extends PIXI.Shader {
  static classPluginName: string | null = null;
  static batchShaderGeneratorClass: unknown = null;
  static batchGeometry: unknown[] = [];
  static batchVertexSize = 6;
  static reservedTextureUnits = 0;
  static vertexShader: ShaderSource = DEFAULT_SAMPLER_VERTEX;
  static fragmentShader: ShaderSource = DEFAULT_SAMPLER_FRAGMENT;
  static defaultUniforms: Record<string, unknown> = { sampler: 0, tintAlpha: [1, 1, 1, 1] };

  static create<T extends BaseSamplerShader>(this: new (program: PIXI.Program, uniforms?: Record<string, unknown>) => T, initialUniforms: Record<string, unknown> = {}): T {
    const shaderClass = this as unknown as typeof BaseSamplerShader;
    const program = PIXI.Program.from(resolveSource(shaderClass.vertexShader) ?? DEFAULT_SAMPLER_VERTEX, resolveSource(shaderClass.fragmentShader) ?? DEFAULT_SAMPLER_FRAGMENT);
    return new this(program, { ...structuredCloneUniforms(shaderClass.defaultUniforms), ...initialUniforms });
  }

  static registerPlugin(): void {}

  get enabled(): boolean {
    return true;
  }
}

export class BatchShaderGenerator extends PIXI.BatchShaderGenerator {
  constructor(vertexSource: string = PIXI.BatchRenderer.defaultVertexSrc, fragmentTemplate: string = PIXI.BatchRenderer.defaultFragmentTemplate) {
    super(vertexSource, fragmentTemplate);
  }
}

export class RegionShader extends BaseSamplerShader {}
export class HighlightRegionShader extends RegionShader {}
export class ColorAdjustmentsSamplerShader extends BaseSamplerShader {}

export function createRenderingNamespace() {
  return {
    batching: { BatchShaderGenerator },
    filters: { AbstractBaseFilter },
    shaders: { BaseSamplerShader, RegionShader, HighlightRegionShader, ColorAdjustmentsSamplerShader },
  };
}
