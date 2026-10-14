import { DiceTerm, MAX_RESULTS_PER_TERM, type DiceTermConstructorData, type DiceTermResult, type ModifierHandler } from "./DiceTerm";

function firstInteger(modifier: string, fallback: number): number {
  const match = /(\d+)/.exec(modifier);
  return match ? Number(match[1]) : fallback;
}

function comparisonOrDefault(modifier: string, command: string, defaultTarget: number): { comparison: string; target: number } {
  const parsed = DiceTerm.parseComparison(modifier, command);
  return { comparison: parsed.comparison, target: parsed.target ?? defaultTarget };
}

/** Standard polyhedral die (`NdF`) with the modifier set of the v13 dice grammar. */
export class Die extends DiceTerm {
  static override DENOMINATION = "d";
  static override MODIFIERS: Record<string, ModifierHandler> = {
    r: "reroll",
    rr: "rerollRecursive",
    x: "explode",
    xo: "explodeOnce",
    k: "keep",
    kh: "keep",
    kl: "keep",
    d: "drop",
    dh: "drop",
    dl: "drop",
    min: "minimum",
    max: "maximum",
    even: "countEven",
    odd: "countOdd",
    cs: "countSuccess",
    cf: "countFailures",
    df: "deductFailures",
    sf: "subtractFailures",
    ms: "marginSuccess",
  };

  constructor(data: DiceTermConstructorData = {}) {
    super(data);
  }

  override get facesLabel(): string {
    return String(this.faces);
  }

  override get total(): number | undefined {
    const total = super.total;
    if (total === undefined) return undefined;
    const margin = this.options.marginSuccess as { comparison: string; target: number } | undefined;
    if (!margin) return total;
    return margin.comparison.startsWith("<") ? margin.target - total : total - margin.target;
  }

  reroll(modifier: string, { recursive = false }: { recursive?: boolean } = {}): void {
    const command = recursive ? "rr" : "r";
    const { comparison, target } = comparisonOrDefault(modifier, command, 1);
    let checkFrom = 0;
    let checkUntil = this.results.length;
    do {
      for (let index = checkFrom; index < checkUntil; index += 1) {
        const result = this.results[index];
        if (!result.active || !DiceTerm.compareResult(result.result, comparison, target)) continue;
        result.rerolled = true;
        result.active = false;
        this.rollSync();
      }
      checkFrom = checkUntil;
      checkUntil = this.results.length;
    } while (recursive && checkFrom < checkUntil && this.results.length < MAX_RESULTS_PER_TERM);
  }

  rerollRecursive(modifier: string): void {
    this.reroll(modifier, { recursive: true });
  }

  explode(modifier: string, { recursive = true }: { recursive?: boolean } = {}): void {
    const command = recursive ? "x" : "xo";
    const { comparison, target } = comparisonOrDefault(modifier, command, this.faces);
    if (comparison === ">=" && target <= 1) return;
    let checkFrom = 0;
    let checkUntil = this.results.length;
    do {
      for (let index = checkFrom; index < checkUntil; index += 1) {
        const result = this.results[index];
        if (!result.active || !DiceTerm.compareResult(result.result, comparison, target)) continue;
        result.exploded = true;
        this.rollSync();
      }
      checkFrom = checkUntil;
      checkUntil = this.results.length;
    } while (recursive && checkFrom < checkUntil && this.results.length < MAX_RESULTS_PER_TERM);
  }

  explodeOnce(modifier: string): void {
    this.explode(modifier, { recursive: false });
  }

  keep(modifier: string): void {
    const lowest = /^kl/i.test(modifier);
    DiceTerm._keepOrDrop(this.results, firstInteger(modifier, 1), { keep: true, highest: !lowest });
  }

  drop(modifier: string): void {
    const highest = /^dh/i.test(modifier);
    DiceTerm._keepOrDrop(this.results, firstInteger(modifier, 1), { keep: false, highest });
  }

  minimum(modifier: string): void {
    const floor = firstInteger(modifier, 1);
    for (const result of this.results) if (result.active && result.result < floor) result.result = floor;
  }

  maximum(modifier: string): void {
    const ceiling = firstInteger(modifier, this.faces);
    for (const result of this.results) if (result.active && result.result > ceiling) result.result = ceiling;
  }

  countEven(): void {
    for (const result of this.#activeResults()) {
      result.success = result.result % 2 === 0;
      result.count = result.success ? 1 : 0;
    }
  }

  countOdd(): void {
    for (const result of this.#activeResults()) {
      result.success = result.result % 2 !== 0;
      result.count = result.success ? 1 : 0;
    }
  }

  countSuccess(modifier: string): void {
    const { comparison, target } = comparisonOrDefault(modifier, "cs", this.faces);
    DiceTerm._applyCount(this.results, comparison, target, { flagSuccess: true });
  }

  countFailures(modifier: string): void {
    const { comparison, target } = comparisonOrDefault(modifier, "cf", 1);
    DiceTerm._applyCount(this.results, comparison, target, { flagFailure: true });
  }

  deductFailures(modifier: string): void {
    const { comparison, target } = comparisonOrDefault(modifier, "df", 1);
    DiceTerm._applyDeduct(this.results, comparison, target, { deductFailure: true });
  }

  subtractFailures(modifier: string): void {
    const { comparison, target } = comparisonOrDefault(modifier, "sf", 1);
    DiceTerm._applyDeduct(this.results, comparison, target, { invertFailure: true });
  }

  marginSuccess(modifier: string): void {
    const parsed = DiceTerm.parseComparison(modifier, "ms");
    if (parsed.target === null) return;
    this.options.marginSuccess = { comparison: parsed.comparison, target: parsed.target };
  }

  #activeResults(): DiceTermResult[] {
    return this.results.filter((result) => result.active);
  }
}

export class Coin extends DiceTerm {
  static override DENOMINATION = "c";
  static override MODIFIERS: Record<string, ModifierHandler> = { c: "call" };

  constructor(data: DiceTermConstructorData = {}) {
    super({ ...data, faces: 2 });
  }

  override get minimumResult(): number {
    return 0;
  }

  override get maximumResult(): number {
    return 1;
  }

  override mapRandomFace(randomUniform: number): number {
    return randomUniform < 0.5 ? 0 : 1;
  }

  call(modifier: string): void {
    const called = firstInteger(modifier, 1) === 0 ? 0 : 1;
    for (const result of this.results) {
      if (!result.active) continue;
      result.success = result.result === called;
      result.count = result.success ? 1 : 0;
    }
  }

  override getResultLabel(result: DiceTermResult): string {
    return result.result === 1 ? "Cara" : "Coroa";
  }

  override getResultCSS(result: DiceTermResult): Array<string | null> {
    return ["coin", result.result === 1 ? "heads" : "tails", result.success ? "success" : null, result.discarded ? "discarded" : null];
  }
}

export class FateDie extends DiceTerm {
  static override DENOMINATION = "f";
  static override MODIFIERS: Record<string, ModifierHandler> = { r: "reroll", rr: "rerollRecursive", k: "keep", kh: "keep", kl: "keep", d: "drop", dh: "drop", dl: "drop" };

  constructor(data: DiceTermConstructorData = {}) {
    super({ ...data, faces: 3 });
  }

  override get minimumResult(): number {
    return -1;
  }

  override get maximumResult(): number {
    return 1;
  }

  override mapRandomFace(randomUniform: number): number {
    return Math.ceil((1 - randomUniform) * 3) - 2;
  }

  reroll(modifier: string): void {
    Die.prototype.reroll.call(this, modifier);
  }

  rerollRecursive(modifier: string): void {
    Die.prototype.reroll.call(this, modifier, { recursive: true });
  }

  keep(modifier: string): void {
    Die.prototype.keep.call(this, modifier);
  }

  drop(modifier: string): void {
    Die.prototype.drop.call(this, modifier);
  }

  override getResultLabel(result: DiceTermResult): string {
    return { "-1": "-", "0": "0", "1": "+" }[String(result.result)] ?? String(result.result);
  }

  override getResultCSS(result: DiceTermResult): Array<string | null> {
    return ["fate", "df", result.discarded ? "discarded" : null, result.rerolled ? "rerolled" : null];
  }
}
