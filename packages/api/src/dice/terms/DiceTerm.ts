import type { PlainObject } from "@tabbletop/common";
import { currentConfig } from "../../runtime";
import { RollTerm, type RollTermData, type RollTermEvaluateOptions } from "./RollTerm";

export interface DiceTermResult {
  result: number;
  active: boolean;
  count?: number;
  success?: boolean;
  failure?: boolean;
  discarded?: boolean;
  rerolled?: boolean;
  exploded?: boolean;
  hidden?: boolean;
}

export interface DiceTermConstructorData {
  number?: number;
  faces?: number;
  modifiers?: string[];
  results?: DiceTermResult[];
  method?: string;
  options?: PlainObject;
}

export type ModifierHandler = string | ((this: DiceTerm, modifier: string) => unknown);

export interface ParsedComparison {
  comparison: string;
  target: number | null;
}

/** Hard caps that keep a hostile formula (e.g. 999999d6x1) from freezing every client. */
export const MAX_DICE_PER_TERM = 1000;
export const MAX_DIE_FACES = 10_000;
export const MAX_RESULTS_PER_TERM = 2000;

const RESULT_FLAGS = ["success", "failure", "discarded", "rerolled", "exploded", "hidden"] as const;

function sanitizeResult(raw: unknown): DiceTermResult | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as PlainObject;
  const value = Number(source.result);
  if (!Number.isFinite(value)) return null;
  const result: DiceTermResult = { result: value, active: source.active !== false };
  if (source.count !== undefined && Number.isFinite(Number(source.count))) result.count = Number(source.count);
  for (const flag of RESULT_FLAGS) if (source[flag] === true) result[flag] = true;
  return result;
}

function boundedInteger(value: unknown, fallback: number, max: number): number {
  const numeric = Math.trunc(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.min(numeric, max);
}

export class DiceTerm extends RollTerm {
  static DENOMINATION = "";
  static MODIFIERS: Record<string, ModifierHandler> = {};
  static MODIFIER_REGEXP = /([A-Za-z]+)([^A-Za-z\s()+\-*/]+)?/g;
  static override SERIALIZE_ATTRIBUTES = ["number", "faces", "modifiers", "results", "method"];

  number: number;
  faces: number;
  modifiers: string[];
  results: DiceTermResult[];
  method: string | undefined;

  constructor({ number = 1, faces = 6, modifiers = [], results = [], method, options = {} }: DiceTermConstructorData = {}) {
    super({ options });
    this.number = boundedInteger(number, 1, MAX_DICE_PER_TERM);
    this.faces = boundedInteger(faces, 6, MAX_DIE_FACES);
    this.modifiers = Array.isArray(modifiers) ? modifiers.filter((modifier) => typeof modifier === "string").slice(0, 20) : [];
    this.results = Array.isArray(results) ? results.map(sanitizeResult).filter((result): result is DiceTermResult => result !== null).slice(0, MAX_RESULTS_PER_TERM) : [];
    this.method = typeof method === "string" ? method : undefined;
  }

  get denomination(): string {
    return (this.constructor as typeof DiceTerm).DENOMINATION;
  }

  get facesLabel(): string {
    return this.denomination;
  }

  override get expression(): string {
    return `${this.number}d${this.facesLabel}${this.modifiers.join("")}`;
  }

  override get isDeterministic(): boolean {
    return false;
  }

  override get total(): number | undefined {
    if (!this._evaluated) return undefined;
    return this.results.reduce((sum, result) => (result.active ? sum + (result.count ?? result.result) : sum), 0);
  }

  get values(): number[] {
    return this.results.filter((result) => result.active).map((result) => result.result);
  }

  get dice(): DiceTerm[] {
    return [this];
  }

  get minimumResult(): number {
    return 1;
  }

  get maximumResult(): number {
    return this.faces;
  }

  mapRandomFace(randomUniform: number): number {
    return Math.ceil((1 - randomUniform) * this.faces);
  }

  randomFace(): number {
    const uniform = currentConfig().Dice?.randomUniform;
    return this.mapRandomFace(typeof uniform === "function" ? uniform() : Math.random());
  }

  async roll(options: { minimize?: boolean; maximize?: boolean } = {}): Promise<DiceTermResult> {
    return this.rollSync(options);
  }

  rollSync({ minimize = false, maximize = false }: { minimize?: boolean; maximize?: boolean } = {}): DiceTermResult {
    if (this.results.length >= MAX_RESULTS_PER_TERM) throw new Error(`A single dice term may not produce more than ${MAX_RESULTS_PER_TERM} results`);
    const value = minimize ? this.minimumResult : maximize ? this.maximumResult : this.randomFace();
    const result: DiceTermResult = { result: value, active: true };
    this.results.push(result);
    return result;
  }

  override _evaluateSync(options: RollTermEvaluateOptions): void {
    if (this.faces < 1 && this.denomination === "d") throw new Error("Dice must have at least one face");
    for (let index = this.results.length; index < this.number; index += 1) {
      this.rollSync({ minimize: options.minimize === true, maximize: options.maximize === true });
    }
    this._evaluateModifiers();
  }

  _evaluateModifiers(): void {
    const handlers = (this.constructor as typeof DiceTerm).MODIFIERS;
    const commands = Object.keys(handlers).sort((left, right) => right.length - left.length);
    for (const modifier of this.modifiers) {
      const letters = (/^[A-Za-z]+/.exec(modifier)?.[0] ?? "").toLowerCase();
      const command = commands.find((candidate) => letters === candidate) ?? commands.find((candidate) => letters.startsWith(candidate));
      if (!command) continue;
      const handler = handlers[command];
      const method = typeof handler === "string" ? (this as any)[handler] : handler;
      if (typeof method === "function") method.call(this, modifier);
    }
  }

  getResultLabel(result: DiceTermResult): string {
    return String(result.result);
  }

  getResultCSS(result: DiceTermResult): Array<string | null> {
    return [
      this.constructor.name.toLowerCase(),
      `d${this.faces}`,
      result.success ? "success" : null,
      result.failure ? "failure" : null,
      result.rerolled ? "rerolled" : null,
      result.exploded ? "exploded" : null,
      result.discarded ? "discarded" : null,
      result.result === this.minimumResult ? "min" : null,
      result.result === this.maximumResult ? "max" : null,
    ];
  }

  getTooltipData(): PlainObject {
    return {
      formula: this.expression,
      total: this.total,
      faces: this.faces,
      flavor: this.flavor,
      rolls: this.results.map((result) => ({ result: this.getResultLabel(result), classes: this.getResultCSS(result).filter(Boolean).join(" ") })),
    };
  }

  static compareResult(result: number, comparison: string, target: number): boolean {
    switch (comparison) {
      case "=":
      case "==":
        return result === target;
      case "<":
        return result < target;
      case "<=":
        return result <= target;
      case ">":
        return result > target;
      case ">=":
        return result >= target;
      default:
        return false;
    }
  }

  static parseComparison(modifier: string, command: string): ParsedComparison {
    const match = new RegExp(`^${command}([<>=]+)?(\\d+)?$`, "i").exec(modifier);
    const comparison = match?.[1] ?? "=";
    const target = match?.[2] !== undefined ? Number(match[2]) : null;
    return { comparison: comparison === "==" ? "=" : comparison, target };
  }

  /** Marks results outside the kept set as discarded; shared by dice and dice pools. */
  static _keepOrDrop(results: DiceTermResult[], count: number, { keep = true, highest = true }: { keep?: boolean; highest?: boolean } = {}): void {
    const active = results.filter((result) => result.active);
    const ordered = [...active].sort((left, right) => (highest ? right.result - left.result : left.result - right.result));
    const affected = keep ? ordered.slice(Math.max(count, 0)) : ordered.slice(0, Math.max(count, 0));
    for (const result of affected) {
      result.discarded = true;
      result.active = false;
    }
  }

  static _applyCount(results: DiceTermResult[], comparison: string, target: number, { flagSuccess = false, flagFailure = false } = {}): void {
    for (const result of results) {
      if (!result.active) continue;
      const matches = DiceTerm.compareResult(result.result, comparison, target);
      if (flagSuccess) {
        result.success = matches;
        result.count = matches ? 1 : 0;
      } else if (flagFailure) {
        result.failure = matches;
        result.count = matches ? 1 : 0;
      }
    }
  }

  static _applyDeduct(results: DiceTermResult[], comparison: string, target: number, { deductFailure = false, invertFailure = false } = {}): void {
    for (const result of results) {
      if (!result.active) continue;
      if (!DiceTerm.compareResult(result.result, comparison, target)) {
        result.count ??= result.success ? 1 : 0;
        continue;
      }
      result.failure = true;
      result.count = deductFailure ? -1 : invertFailure ? -result.result : result.count;
    }
  }

  static override _fromData(data: RollTermData): RollTerm {
    const term = new this(data as DiceTermConstructorData);
    term._evaluated = data.evaluated ?? true;
    return term;
  }
}
