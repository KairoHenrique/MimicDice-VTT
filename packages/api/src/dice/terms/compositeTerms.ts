import type { PlainObject } from "@tabbletop/common";
import { rollFactory, type RollLike } from "../rollFactory";
import { MATH_FUNCTIONS } from "../safeEval";
import { DiceTerm, type DiceTermResult } from "./DiceTerm";
import { RollTerm, type RollTermData, type RollTermEvaluateOptions } from "./RollTerm";

function restoreRoll(candidate: unknown): RollLike | undefined {
  if (!candidate || typeof candidate !== "object") return undefined;
  if (typeof (candidate as RollLike).evaluate === "function") return candidate as RollLike;
  return rollFactory().fromData(candidate as PlainObject);
}

function diceOf(rolls: Array<RollLike | undefined>): DiceTerm[] {
  return rolls.flatMap((roll) => (roll?.dice ?? []) as DiceTerm[]);
}

export class ParentheticalTerm extends RollTerm {
  static override SERIALIZE_ATTRIBUTES = ["term", "roll"];

  term: string;
  roll: RollLike | undefined;

  constructor({ term, roll, options }: { term: string; roll?: unknown; options?: PlainObject }) {
    super({ options });
    this.term = String(term ?? "");
    this.roll = restoreRoll(roll);
  }

  override get expression(): string {
    return `(${this.term})`;
  }

  override get total(): number | undefined {
    return this.roll?.total;
  }

  override get isDeterministic(): boolean {
    return (this.roll ?? rollFactory().create(this.term)).terms.every((term) => (term as RollTerm).isDeterministic);
  }

  get dice(): DiceTerm[] {
    return diceOf([this.roll]);
  }

  override async _evaluateAsync(options: RollTermEvaluateOptions): Promise<void> {
    this.roll ??= rollFactory().create(this.term);
    if (!this.roll._evaluated) await this.roll.evaluate(options);
  }

  override _evaluateSync(options: RollTermEvaluateOptions): void {
    this.roll ??= rollFactory().create(this.term);
    if (!this.roll._evaluated) this.roll.evaluateSync(options);
  }

  override toJSON(): RollTermData {
    return { ...super.toJSON(), roll: this.roll?.toJSON() };
  }
}

export class FunctionTerm extends RollTerm {
  static override SERIALIZE_ATTRIBUTES = ["fn", "terms", "result"];

  fn: string;
  terms: string[];
  rolls: RollLike[];
  result: number | undefined;

  constructor({ fn, terms = [], rolls = [], result, options }: { fn: string; terms?: string[]; rolls?: unknown[]; result?: number; options?: PlainObject }) {
    super({ options });
    if (!Object.hasOwn(MATH_FUNCTIONS, fn)) throw new Error(`Unknown roll function "${String(fn).slice(0, 32)}"`);
    this.fn = fn;
    this.terms = Array.isArray(terms) ? terms.map(String).slice(0, 20) : [];
    this.rolls = (Array.isArray(rolls) ? rolls : []).map(restoreRoll).filter((roll): roll is RollLike => roll !== undefined);
    this.result = typeof result === "number" && Number.isFinite(result) ? result : undefined;
  }

  override get expression(): string {
    return `${this.fn}(${this.terms.join(",")})`;
  }

  override get total(): number | undefined {
    return this.result;
  }

  override get isDeterministic(): boolean {
    return this.terms.every((term) => rollFactory().create(term).terms.every((child) => (child as RollTerm).isDeterministic));
  }

  get dice(): DiceTerm[] {
    return diceOf(this.rolls);
  }

  override async _evaluateAsync(options: RollTermEvaluateOptions): Promise<void> {
    this.rolls = this.terms.map((term) => rollFactory().create(term));
    for (const roll of this.rolls) await roll.evaluate(options);
    this.#applyFunction();
  }

  override _evaluateSync(options: RollTermEvaluateOptions): void {
    this.rolls = this.terms.map((term) => rollFactory().create(term));
    for (const roll of this.rolls) roll.evaluateSync(options);
    this.#applyFunction();
  }

  override toJSON(): RollTermData {
    return { ...super.toJSON(), rolls: this.rolls.map((roll) => roll.toJSON()) };
  }

  #applyFunction(): void {
    this.result = MATH_FUNCTIONS[this.fn](...this.rolls.map((roll) => Number(roll.total)));
  }
}

export class PoolTerm extends RollTerm {
  static MODIFIERS: Record<string, string> = { k: "keep", kh: "keep", kl: "keep", d: "drop", dh: "drop", dl: "drop", cs: "countSuccess", cf: "countFailures" };
  static override SERIALIZE_ATTRIBUTES = ["terms", "modifiers", "rolls", "results"];

  terms: string[];
  modifiers: string[];
  rolls: RollLike[];
  results: DiceTermResult[];

  constructor({ terms = [], modifiers = [], rolls = [], results = [], options }: { terms?: string[]; modifiers?: string[]; rolls?: unknown[]; results?: DiceTermResult[]; options?: PlainObject }) {
    super({ options });
    this.terms = Array.isArray(terms) ? terms.map(String).slice(0, 50) : [];
    this.modifiers = Array.isArray(modifiers) ? modifiers.filter((modifier) => typeof modifier === "string").slice(0, 10) : [];
    this.rolls = (Array.isArray(rolls) ? rolls : []).map(restoreRoll).filter((roll): roll is RollLike => roll !== undefined);
    this.results = Array.isArray(results)
      ? results.filter((result) => Number.isFinite(Number(result?.result))).map((result) => ({ ...result, result: Number(result.result), active: result.active !== false }))
      : [];
  }

  /** Wraps already-built rolls in a pool; evaluated rolls produce an evaluated pool. */
  static fromRolls(rolls: RollLike[] = []): PoolTerm {
    const evaluatedCount = rolls.filter((roll) => roll._evaluated).length;
    if (evaluatedCount > 0 && evaluatedCount < rolls.length) throw new Error("Não é possível misturar rolagens avaliadas e não avaliadas num PoolTerm");
    const pool = new this({ terms: rolls.map((roll) => roll.formula), rolls });
    if (evaluatedCount > 0) {
      pool.results = pool.rolls.map((roll) => ({ result: Number(roll.total), active: true }));
      pool._evaluated = true;
    }
    return pool;
  }

  override get expression(): string {
    return `{${this.terms.join(",")}}${this.modifiers.join("")}`;
  }

  override get total(): number | undefined {
    if (!this._evaluated) return undefined;
    return this.results.reduce((sum, result) => (result.active ? sum + (result.count ?? result.result) : sum), 0);
  }

  override get isDeterministic(): boolean {
    return false;
  }

  get dice(): DiceTerm[] {
    return diceOf(this.rolls);
  }

  get values(): number[] {
    return this.results.filter((result) => result.active).map((result) => result.result);
  }

  override async _evaluateAsync(options: RollTermEvaluateOptions): Promise<void> {
    this.rolls = this.terms.map((term) => rollFactory().create(term));
    for (const roll of this.rolls) await roll.evaluate(options);
    this.#collectResults();
  }

  override _evaluateSync(options: RollTermEvaluateOptions): void {
    this.rolls = this.terms.map((term) => rollFactory().create(term));
    for (const roll of this.rolls) roll.evaluateSync(options);
    this.#collectResults();
  }

  override toJSON(): RollTermData {
    return { ...super.toJSON(), rolls: this.rolls.map((roll) => roll.toJSON()) };
  }

  keep(modifier: string): void {
    const count = Number(/(\d+)/.exec(modifier)?.[1] ?? 1);
    DiceTerm._keepOrDrop(this.results, count, { keep: true, highest: !/^kl/i.test(modifier) });
  }

  drop(modifier: string): void {
    const count = Number(/(\d+)/.exec(modifier)?.[1] ?? 1);
    DiceTerm._keepOrDrop(this.results, count, { keep: false, highest: /^dh/i.test(modifier) });
  }

  countSuccess(modifier: string): void {
    const { comparison, target } = DiceTerm.parseComparison(modifier, "cs");
    DiceTerm._applyCount(this.results, comparison, target ?? 1, { flagSuccess: true });
  }

  countFailures(modifier: string): void {
    const { comparison, target } = DiceTerm.parseComparison(modifier, "cf");
    DiceTerm._applyCount(this.results, comparison, target ?? 1, { flagFailure: true });
  }

  #collectResults(): void {
    this.results = this.rolls.map((roll) => ({ result: Number(roll.total), active: true }));
    const commands = Object.keys(PoolTerm.MODIFIERS).sort((left, right) => right.length - left.length);
    for (const modifier of this.modifiers) {
      const letters = (/^[A-Za-z]+/.exec(modifier)?.[0] ?? "").toLowerCase();
      const command = commands.find((candidate) => letters === candidate);
      if (command) (this as any)[PoolTerm.MODIFIERS[command]](modifier);
    }
  }
}
