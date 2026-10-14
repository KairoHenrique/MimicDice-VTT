import { deepClone, getProperty, type PlainObject } from "@tabbletop/common";
import { renderTemplate } from "../handlebars/templates";
import { currentConfig, currentGame } from "../runtime";
import { registerRollFactory } from "./rollFactory";
import { RollParser } from "./RollParser";
import { renderRollCard, renderTooltip } from "./rollRendering";
import { MATH_FUNCTIONS, safeEvalArithmetic } from "./safeEval";
import { DiceTerm } from "./terms/DiceTerm";
import { FunctionTerm, ParentheticalTerm, PoolTerm } from "./terms/compositeTerms";
import { NumericTerm, OperatorTerm, RollTerm, StringTerm, type RollTermData, type RollTermEvaluateOptions } from "./terms/RollTerm";

const DEFAULT_CHAT_TEMPLATE = "templates/dice/roll.html";
const DATA_REFERENCE = /@([a-z.0-9_-]+)/gi;

export interface RollEvaluateOptions extends RollTermEvaluateOptions {
  strict?: boolean;
}

export interface RollToMessageOptions {
  rollMode?: string;
  create?: boolean;
}

export interface RollRenderOptions {
  flavor?: string;
  template?: string;
  isPrivate?: boolean;
}

function termsWithDice(term: RollTerm): DiceTerm[] {
  if (term instanceof DiceTerm) return [term];
  if (term instanceof ParentheticalTerm || term instanceof FunctionTerm || term instanceof PoolTerm) return term.dice;
  return [];
}

export class Roll {
  static CHAT_TEMPLATE = DEFAULT_CHAT_TEMPLATE;
  static TOOLTIP_TEMPLATE = "templates/dice/tooltip.html";
  static MATH_PROXY = MATH_FUNCTIONS;

  data: PlainObject;
  options: PlainObject;
  terms: RollTerm[];
  _dice: DiceTerm[] = [];
  _formula: string;
  _evaluated = false;
  _total: number | undefined;
  _root: unknown = null;

  constructor(formula: string, data: PlainObject = {}, options: PlainObject = {}) {
    this.data = this._prepareData(data);
    this.options = options;
    this.terms = (this.constructor as typeof Roll).parse(String(formula ?? ""), this.data);
    this._formula = Roll.getFormula(this.terms);
  }

  static get defaultImplementation(): typeof Roll {
    return (currentConfig().Dice?.rolls?.[0] as typeof Roll | undefined) ?? Roll;
  }

  get formula(): string {
    return Roll.getFormula(this.terms);
  }

  get total(): number | undefined {
    return this._total;
  }

  get result(): string {
    return this.terms.map((term) => (term instanceof OperatorTerm ? term.total : String(term.total ?? term.expression))).join("").trim();
  }

  get dice(): DiceTerm[] {
    return [...this._dice, ...this.terms.flatMap(termsWithDice)];
  }

  get isDeterministic(): boolean {
    return this.terms.every((term) => term.isDeterministic);
  }

  get product(): number | undefined {
    return this._total;
  }

  _prepareData(data: PlainObject): PlainObject {
    return data ?? {};
  }

  static parse(formula: string, data: PlainObject = {}): RollTerm[] {
    if (!formula) return [];
    return RollParser.parse(this.replaceFormulaData(formula, data));
  }

  static getFormula(terms: RollTerm[]): string {
    return terms.map((term) => term.formula).join("").replace(/\s+/g, " ").trim();
  }

  static replaceFormulaData(formula: string, data: PlainObject, { missing, warn = false }: { missing?: string; warn?: boolean } = {}): string {
    return String(formula).replace(DATA_REFERENCE, (match, path: string) => {
      const value = getProperty(data, path);
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "string" && value.trim() !== "") return value.length > 500 ? match : value;
      if (warn) currentGame()?.ui?.notifications?.warn?.(`O valor ${match} não existe nos dados da rolagem`);
      return missing !== undefined ? String(missing) : match;
    });
  }

  static validate(formula: string): boolean {
    try {
      this.parse(this.replaceFormulaData(formula, {}, { missing: "0" }));
      return true;
    } catch {
      return false;
    }
  }

  static safeEval(expression: string): number {
    return safeEvalArithmetic(expression);
  }

  static create(formula: string, data: PlainObject = {}, options: PlainObject = {}): Roll {
    return new this.defaultImplementation(formula, data, options);
  }

  static fromTerms(terms: RollTerm[], options: PlainObject = {}): Roll {
    const roll = new this("", {}, options);
    roll.terms = terms;
    roll._formula = Roll.getFormula(terms);
    roll._evaluated = terms.length > 0 && terms.every((term) => term._evaluated || term.isDeterministic);
    if (roll._evaluated) roll._total = roll._evaluateTotal();
    return roll;
  }

  /** Restores a serialized roll; only classes registered in CONFIG.Dice.rolls are instantiated. */
  static fromData(data: PlainObject): Roll {
    const className = typeof data?.class === "string" ? data.class : "Roll";
    const registered = (currentConfig().Dice?.rolls ?? []) as Array<typeof Roll>;
    const RollClass = registered.find((candidate) => candidate.name === className) ?? (className === this.name ? this : Roll);
    const roll = new RollClass("", {}, typeof data.options === "object" && data.options ? (data.options as PlainObject) : {});
    roll.data = {};
    roll.terms = (Array.isArray(data.terms) ? data.terms : []).map((term: unknown) => (term instanceof RollTerm ? term : RollTerm.fromData(term as RollTermData)));
    roll._formula = typeof data.formula === "string" ? data.formula : Roll.getFormula(roll.terms);
    roll._evaluated = data.evaluated !== false;
    const total = Number(data.total);
    roll._total = roll._evaluated && Number.isFinite(total) ? total : undefined;
    return roll;
  }

  static fromJSON(json: string): Roll {
    return this.fromData(JSON.parse(json) as PlainObject);
  }

  async evaluate(options: RollEvaluateOptions = {}): Promise<this> {
    this.#assertNotEvaluated();
    for (const term of this.terms) {
      if (!term._evaluated) await term.evaluate(options);
    }
    return this.#finishEvaluation(options);
  }

  evaluateSync(options: RollEvaluateOptions = {}): this {
    this.#assertNotEvaluated();
    if (options.strict !== false && !this.isDeterministic) {
      throw new Error("This Roll contains dice and cannot be evaluated synchronously in strict mode; use evaluate() instead");
    }
    for (const term of this.terms) {
      if (!term._evaluated) term.evaluateSync(options);
    }
    return this.#finishEvaluation(options);
  }

  /** @deprecated v12 alias kept for older packages. */
  roll(options: RollEvaluateOptions = {}): Promise<this> {
    return this.evaluate(options);
  }

  async reroll(options: RollEvaluateOptions = {}): Promise<Roll> {
    const clone = this.clone();
    return clone.evaluate(options);
  }

  clone(): Roll {
    return new (this.constructor as typeof Roll)(this._formula, this.data, this.options);
  }

  _evaluateTotal(options: RollEvaluateOptions = {}): number {
    const expression = this.terms
      .map((term) => {
        if (term instanceof OperatorTerm) return term.operator;
        if (term instanceof StringTerm) {
          if (term.isDeterministic) return term.term;
          if (options.allowStrings) return "0";
          throw new Error(`Unresolved StringTerm "${term.term}" requested for evaluation`);
        }
        const total = term.total;
        if (typeof total !== "number" || !Number.isFinite(total)) throw new Error(`Roll term ${term.expression} did not produce a number`);
        return `(${total})`;
      })
      .join(" ");
    if (!expression.trim()) return 0;
    const total = Roll.safeEval(expression);
    if (!Number.isFinite(total)) throw new Error("Roll total is not a finite number");
    return total;
  }

  async getTooltip(): Promise<string> {
    return renderTooltip(this.dice.map((die) => die.getTooltipData()));
  }

  async render({ flavor, template = (this.constructor as typeof Roll).CHAT_TEMPLATE, isPrivate = false }: RollRenderOptions = {}): Promise<string> {
    if (!this._evaluated) await this.evaluate({ allowInteractive: !isPrivate });
    const data = {
      formula: isPrivate ? "???" : this._formula,
      flavor: isPrivate ? null : (flavor ?? (typeof this.options.flavor === "string" ? this.options.flavor : null)),
      user: currentGame()?.user?.id,
      tooltip: isPrivate ? "" : await this.getTooltip(),
      total: isPrivate ? "?" : Math.round((this._total ?? 0) * 100) / 100,
      isPrivate,
    };
    if (template !== DEFAULT_CHAT_TEMPLATE) return renderTemplate(template, data);
    return renderRollCard(data);
  }

  async toMessage(messageData: PlainObject = {}, { rollMode, create = true }: RollToMessageOptions = {}): Promise<unknown> {
    if (!this._evaluated) await this.evaluate({ allowInteractive: rollMode !== "blindroll" });
    const ChatMessageClass = currentConfig().ChatMessage?.documentClass;
    const game = currentGame();
    const data: PlainObject = {
      author: game?.user?.id,
      content: String(this._total),
      sound: currentConfig().sounds?.dice ?? null,
      ...messageData,
      rolls: [...((messageData.rolls as unknown[]) ?? []), this],
    };
    const mode = rollMode ?? (messageData.rollMode as string | undefined) ?? game?.settings?.get?.("core", "rollMode");
    if (ChatMessageClass?.applyRollMode) ChatMessageClass.applyRollMode(data, mode);
    if (!create) return data;
    return ChatMessageClass.create(data, { rollMode: mode });
  }

  toJSON(): PlainObject {
    return {
      class: this.constructor.name,
      options: deepClone(this.options),
      dice: [],
      formula: this._formula,
      terms: this.terms.map((term) => term.toJSON()),
      total: this._total,
      evaluated: this._evaluated,
    };
  }

  #finishEvaluation(options: RollEvaluateOptions): this {
    this._total = this._evaluateTotal(options);
    this._evaluated = true;
    return this;
  }

  #assertNotEvaluated(): void {
    if (this._evaluated) throw new Error(`The ${this.constructor.name} has already been evaluated and is now immutable`);
  }
}

registerRollFactory({
  create: (formula, data, options) => Roll.create(formula, data, options) as never,
  fromData: (data) => Roll.fromData(data) as never,
});

export { DiceTerm, FunctionTerm, NumericTerm, OperatorTerm, ParentheticalTerm, PoolTerm, RollTerm, StringTerm };
