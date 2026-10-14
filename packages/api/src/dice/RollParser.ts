import { currentConfig } from "../runtime";
import { rollFactory } from "./rollFactory";
import { MATH_FUNCTIONS } from "./safeEval";
import { FunctionTerm, ParentheticalTerm, PoolTerm } from "./terms/compositeTerms";
import { DiceTerm } from "./terms/DiceTerm";
import { Die } from "./terms/Die";
import { NumericTerm, OperatorTerm, ROLL_OPERATORS, RollTerm, StringTerm } from "./terms/RollTerm";

export const MAX_FORMULA_LENGTH = 2000;

const DICE_PATTERN = /^(\d*)[dD]([A-Za-z]|\d+)((?:[A-Za-z]+[^A-Za-z\s()+\-*/%{}[\],]*)*)/;
const DENOMINATION_AFTER_GROUP = /^[dD]([A-Za-z]|\d+)((?:[A-Za-z]+[^A-Za-z\s()+\-*/%{}[\],]*)*)/;
const POOL_MODIFIERS = /^((?:[A-Za-z]+[^A-Za-z\s()+\-*/%{}[\],]*)*)/;
const NUMBER_PATTERN = /^\d+(?:\.\d+)?/;
const FUNCTION_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\(/;
const FLAVOR_PATTERN = /^\[([^\]]*)\]/;
const STRING_PATTERN = /^[^\s+\-*/%()[\]{},]+/;

function splitModifiers(modifiers: string): string[] {
  return Array.from(modifiers.matchAll(/([A-Za-z]+)([^A-Za-z\s()+\-*/]+)?/g), (match) => match[0]);
}

/** Index of the bracket closing the one at `openIndex`, or -1. */
function findClosing(formula: string, openIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let index = openIndex; index < formula.length; index += 1) {
    if (formula[index] === open) depth += 1;
    else if (formula[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Splits on commas that are not nested inside (), {} or []. */
function splitTopLevel(content: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if ("({[".includes(character)) depth += 1;
    else if (")}]".includes(character)) depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(content.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(content.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function diceTermClass(denomination: string): typeof DiceTerm {
  if (/^\d+$/.test(denomination)) return (currentConfig().Dice?.terms?.d as typeof DiceTerm | undefined) ?? Die;
  const registered = currentConfig().Dice?.terms?.[denomination.toLowerCase()] as typeof DiceTerm | undefined;
  if (!registered) throw new Error(`Unknown dice denomination "d${denomination}"`);
  return registered;
}

function createDiceTerm(count: number, denomination: string, modifiers: string): DiceTerm {
  const TermClass = diceTermClass(denomination);
  const faces = /^\d+$/.test(denomination) ? Number(denomination) : undefined;
  return new TermClass({ number: count, faces, modifiers: splitModifiers(modifiers) });
}

/** Converts a data-substituted formula into roll terms, following the v13 dice grammar. */
export class RollParser {
  #position = 0;
  readonly #terms: RollTerm[] = [];

  constructor(private readonly formula: string) {
    if (formula.length > MAX_FORMULA_LENGTH) throw new Error("Roll formula is too long");
  }

  static parse(formula: string): RollTerm[] {
    return new RollParser(formula).parse();
  }

  parse(): RollTerm[] {
    while (this.#skipWhitespace()) {
      if (this.formula[this.#position] === "[") {
        this.#danglingFlavor();
        continue;
      }
      const term = this.#nextTerm();
      this.#attachFlavor(term);
      this.#terms.push(term);
    }
    return this.#terms;
  }

  get #rest(): string {
    return this.formula.slice(this.#position);
  }

  #skipWhitespace(): boolean {
    while (this.#position < this.formula.length && /\s/.test(this.formula[this.#position])) this.#position += 1;
    return this.#position < this.formula.length;
  }

  #consume(length: number): void {
    this.#position += length;
  }

  #nextTerm(): RollTerm {
    const character = this.formula[this.#position];
    if ((ROLL_OPERATORS as readonly string[]).includes(character)) {
      this.#consume(1);
      return new OperatorTerm({ operator: character });
    }
    if (character === "(") return this.#parenthetical();
    if (character === "{") return this.#pool();
    return this.#dice() ?? this.#mathFunction() ?? this.#number() ?? this.#string();
  }

  #parenthetical(): RollTerm {
    const closing = findClosing(this.formula, this.#position, "(", ")");
    if (closing < 0) throw new Error("Unbalanced parentheses in roll formula");
    const inner = this.formula.slice(this.#position + 1, closing).trim();
    this.#position = closing + 1;
    const denomination = DENOMINATION_AFTER_GROUP.exec(this.#rest);
    if (!denomination) return new ParentheticalTerm({ term: inner });
    const count = Number(rollFactory().create(inner).evaluateSync({ strict: true }).total);
    if (!Number.isFinite(count)) throw new Error("Dice count must be a number");
    this.#consume(denomination[0].length);
    return createDiceTerm(Math.max(Math.trunc(count), 0), denomination[1], denomination[2]);
  }

  #pool(): RollTerm {
    const closing = findClosing(this.formula, this.#position, "{", "}");
    if (closing < 0) throw new Error("Unbalanced braces in roll formula");
    const terms = splitTopLevel(this.formula.slice(this.#position + 1, closing));
    this.#position = closing + 1;
    const modifiers = POOL_MODIFIERS.exec(this.#rest)?.[1] ?? "";
    this.#consume(modifiers.length);
    return new PoolTerm({ terms, modifiers: splitModifiers(modifiers) });
  }

  /** Flavor text after whitespace (e.g. "1d20 [ataque]") still belongs to the preceding term. */
  #danglingFlavor(): void {
    const match = FLAVOR_PATTERN.exec(this.#rest);
    if (!match) throw new Error("Unclosed flavor text in roll formula");
    this.#consume(match[0].length);
    const previous = this.#terms[this.#terms.length - 1];
    if (previous) previous.options.flavor = match[1];
  }

  #dice(): RollTerm | null {
    const match = DICE_PATTERN.exec(this.#rest);
    if (!match) return null;
    this.#consume(match[0].length);
    return createDiceTerm(match[1] === "" ? 1 : Number(match[1]), match[2], match[3]);
  }

  #mathFunction(): RollTerm | null {
    const match = FUNCTION_PATTERN.exec(this.#rest);
    if (!match || !Object.hasOwn(MATH_FUNCTIONS, match[1])) return null;
    const openIndex = this.#position + match[1].length;
    const closing = findClosing(this.formula, openIndex, "(", ")");
    if (closing < 0) throw new Error("Unbalanced parentheses in roll formula");
    const terms = splitTopLevel(this.formula.slice(openIndex + 1, closing));
    this.#position = closing + 1;
    return new FunctionTerm({ fn: match[1], terms });
  }

  #number(): RollTerm | null {
    const match = NUMBER_PATTERN.exec(this.#rest);
    if (!match) return null;
    this.#consume(match[0].length);
    return new NumericTerm({ number: Number(match[0]) });
  }

  #string(): RollTerm {
    const match = STRING_PATTERN.exec(this.#rest);
    if (!match) throw new Error(`Unexpected "${this.formula[this.#position]}" in roll formula`);
    this.#consume(match[0].length);
    return new StringTerm({ term: match[0] });
  }

  #attachFlavor(term: RollTerm): void {
    const match = FLAVOR_PATTERN.exec(this.#rest);
    if (!match) return;
    this.#consume(match[0].length);
    term.options.flavor = match[1];
  }
}
