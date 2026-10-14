import type { PlainObject } from "@tabbletop/common";
import { currentConfig } from "../../runtime";

export interface RollTermEvaluateOptions {
  minimize?: boolean;
  maximize?: boolean;
  allowStrings?: boolean;
  allowInteractive?: boolean;
  [option: string]: unknown;
}

export interface RollTermData {
  class?: string;
  options?: PlainObject;
  evaluated?: boolean;
  [attribute: string]: unknown;
}

function sanitizeOptions(options: unknown): PlainObject {
  if (!options || typeof options !== "object" || Array.isArray(options)) return {};
  const sanitized: PlainObject = {};
  for (const [key, value] of Object.entries(options as PlainObject)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export class RollTerm {
  static SERIALIZE_ATTRIBUTES: string[] = [];
  static REGEXP: RegExp | null = null;

  options: PlainObject;
  _evaluated = false;
  _root: unknown = null;

  constructor({ options = {} }: { options?: PlainObject } = {}) {
    this.options = sanitizeOptions(options);
  }

  get isIntermediate(): boolean {
    return false;
  }

  get expression(): string {
    return "";
  }

  get formula(): string {
    return this.flavor ? `${this.expression}[${this.flavor}]` : this.expression;
  }

  get flavor(): string {
    return typeof this.options.flavor === "string" ? this.options.flavor : "";
  }

  get total(): number | string | undefined {
    return undefined;
  }

  get isDeterministic(): boolean {
    return true;
  }

  get resolver(): unknown {
    return undefined;
  }

  async evaluate(options: RollTermEvaluateOptions = {}): Promise<this> {
    this.#assertNotEvaluated();
    this._evaluated = true;
    await this._evaluateAsync(options);
    return this;
  }

  evaluateSync(options: RollTermEvaluateOptions = {}): this {
    this.#assertNotEvaluated();
    this._evaluated = true;
    this._evaluateSync(options);
    return this;
  }

  async _evaluateAsync(options: RollTermEvaluateOptions): Promise<void> {
    this._evaluateSync(options);
  }

  _evaluateSync(_options: RollTermEvaluateOptions): void {}

  toJSON(): RollTermData {
    const data: RollTermData = { class: this.constructor.name, options: this.options, evaluated: this._evaluated };
    for (const attribute of (this.constructor as typeof RollTerm).SERIALIZE_ATTRIBUTES) data[attribute] = (this as any)[attribute];
    return data;
  }

  /** Rebuilds a term from serialized data, resolving the class only through CONFIG.Dice registries. */
  static fromData(data: RollTermData): RollTerm {
    const config = currentConfig().Dice ?? {};
    const className = typeof data?.class === "string" ? data.class : "";
    const termTypes: Record<string, typeof RollTerm> = config.termTypes ?? {};
    let termClass: typeof RollTerm | undefined = Object.hasOwn(termTypes, className) ? termTypes[className] : undefined;
    termClass ??= Object.values((config.terms ?? {}) as Record<string, typeof RollTerm>).find((candidate) => candidate.name === className);
    termClass ??= termTypes.Die ?? config.terms?.d;
    if (!termClass) throw new Error(`Unknown roll term class "${className.slice(0, 64)}"`);
    return termClass._fromData(data);
  }

  static _fromData(data: RollTermData): RollTerm {
    const term = new this(data as any);
    term._evaluated = data.evaluated ?? true;
    return term;
  }

  static fromJSON(json: string): RollTerm {
    return this.fromData(JSON.parse(json) as RollTermData);
  }

  #assertNotEvaluated(): void {
    if (this._evaluated) throw new Error(`The ${this.constructor.name} has already been evaluated and is now immutable`);
  }
}

export class NumericTerm extends RollTerm {
  static override SERIALIZE_ATTRIBUTES = ["number"];
  static override REGEXP = /^[0-9]+(?:\.[0-9]+)?/;

  number: number;

  constructor({ number, options }: { number: number; options?: PlainObject }) {
    super({ options });
    const numeric = Number(number);
    this.number = Number.isFinite(numeric) ? numeric : 0;
  }

  override get expression(): string {
    return String(this.number);
  }

  override get total(): number {
    return this.number;
  }

  static matchTerm(expression: string): RegExpMatchArray | null {
    return expression.match(this.REGEXP as RegExp);
  }
}

export const ROLL_OPERATORS = ["+", "-", "*", "/", "%"] as const;

export class OperatorTerm extends RollTerm {
  static override SERIALIZE_ATTRIBUTES = ["operator"];
  static OPERATORS = [...ROLL_OPERATORS];

  operator: string;

  constructor({ operator, options }: { operator: string; options?: PlainObject }) {
    super({ options });
    this.operator = (ROLL_OPERATORS as readonly string[]).includes(operator) ? operator : "+";
  }

  override get flavor(): string {
    return "";
  }

  override get expression(): string {
    return ` ${this.operator} `;
  }

  override get total(): string {
    return ` ${this.operator} `;
  }
}

export class StringTerm extends RollTerm {
  static override SERIALIZE_ATTRIBUTES = ["term"];

  term: string;

  constructor({ term, options }: { term: string; options?: PlainObject }) {
    super({ options });
    this.term = String(term ?? "").slice(0, 256);
  }

  override get expression(): string {
    return this.term;
  }

  override get total(): string {
    return this.term;
  }

  override get isDeterministic(): boolean {
    const numeric = Number(this.term);
    return Number.isFinite(numeric);
  }

  override _evaluateSync(options: RollTermEvaluateOptions): void {
    if (!options.allowStrings) throw new Error(`Unresolved StringTerm "${this.term}" requested for evaluation`);
  }
}
