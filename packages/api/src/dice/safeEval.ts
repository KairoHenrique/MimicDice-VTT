/**
 * Arithmetic evaluator for roll totals. It never calls eval/Function: formulas come from other players,
 * so only numbers, + - * / % **, parentheses, commas and whitelisted Math functions are understood.
 */

const MAX_EXPRESSION_LENGTH = 4000;
const MAX_NESTING_DEPTH = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundDecimals(value: number, places: number): number {
  const factor = 10 ** Math.trunc(places);
  return Math.round(value * factor) / factor;
}

export const MATH_FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = Object.freeze({
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  cbrt: Math.cbrt,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  round: Math.round,
  sign: Math.sign,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
  trunc: Math.trunc,
  clamp,
  clamped: clamp,
  roundDecimals,
});

const MATH_CONSTANTS: Readonly<Record<string, number>> = Object.freeze({ PI: Math.PI, E: Math.E });

type Token = { kind: "number"; value: number } | { kind: "identifier"; value: string } | { kind: "symbol"; value: string };

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/%(),]))/y;
  let position = 0;
  while (position < expression.length) {
    if (/^\s*$/.test(expression.slice(position))) break;
    pattern.lastIndex = position;
    const match = pattern.exec(expression);
    if (!match) throw new Error(`Unexpected character in roll expression at position ${position}`);
    if (match[1] !== undefined) tokens.push({ kind: "number", value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ kind: "identifier", value: match[2] });
    else tokens.push({ kind: "symbol", value: match[3] });
    position = pattern.lastIndex;
  }
  return tokens;
}

class ExpressionParser {
  #index = 0;
  #depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const value = this.#additive();
    if (this.#index < this.tokens.length) throw new Error("Unexpected token in roll expression");
    return value;
  }

  #peekSymbol(): string | undefined {
    const token = this.tokens[this.#index];
    return token?.kind === "symbol" ? token.value : undefined;
  }

  #expectSymbol(symbol: string): void {
    if (this.#peekSymbol() !== symbol) throw new Error(`Expected "${symbol}" in roll expression`);
    this.#index += 1;
  }

  #additive(): number {
    let value = this.#multiplicative();
    for (let symbol = this.#peekSymbol(); symbol === "+" || symbol === "-"; symbol = this.#peekSymbol()) {
      this.#index += 1;
      const right = this.#multiplicative();
      value = symbol === "+" ? value + right : value - right;
    }
    return value;
  }

  #multiplicative(): number {
    let value = this.#unary();
    for (let symbol = this.#peekSymbol(); symbol === "*" || symbol === "/" || symbol === "%"; symbol = this.#peekSymbol()) {
      this.#index += 1;
      const right = this.#unary();
      if (symbol === "*") value *= right;
      else if (symbol === "/") value /= right;
      else value %= right;
    }
    return value;
  }

  #unary(): number {
    const symbol = this.#peekSymbol();
    if (symbol === "-" || symbol === "+") {
      this.#index += 1;
      const operand = this.#nested(() => this.#unary());
      return symbol === "-" ? -operand : operand;
    }
    return this.#power();
  }

  #power(): number {
    const base = this.#primary();
    if (this.#peekSymbol() !== "**") return base;
    this.#index += 1;
    return base ** this.#nested(() => this.#unary());
  }

  #primary(): number {
    const token = this.tokens[this.#index];
    if (!token) throw new Error("Unexpected end of roll expression");
    this.#index += 1;
    if (token.kind === "number") return token.value;
    if (token.kind === "identifier") return this.#identifier(token.value);
    if (token.value !== "(") throw new Error(`Unexpected "${token.value}" in roll expression`);
    const value = this.#nested(() => this.#additive());
    this.#expectSymbol(")");
    return value;
  }

  #identifier(name: string): number {
    if (this.#peekSymbol() !== "(") {
      if (Object.hasOwn(MATH_CONSTANTS, name)) return MATH_CONSTANTS[name];
      throw new Error(`Unknown value "${name}" in roll expression`);
    }
    if (!Object.hasOwn(MATH_FUNCTIONS, name)) throw new Error(`Unknown function "${name}" in roll expression`);
    this.#index += 1;
    const args: number[] = [];
    if (this.#peekSymbol() !== ")") {
      args.push(this.#nested(() => this.#additive()));
      while (this.#peekSymbol() === ",") {
        this.#index += 1;
        args.push(this.#nested(() => this.#additive()));
      }
    }
    this.#expectSymbol(")");
    return MATH_FUNCTIONS[name](...args);
  }

  #nested(parse: () => number): number {
    this.#depth += 1;
    if (this.#depth > MAX_NESTING_DEPTH) throw new Error("Roll expression is nested too deeply");
    try {
      return parse();
    } finally {
      this.#depth -= 1;
    }
  }
}

export function safeEvalArithmetic(expression: string): number {
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new Error("Roll expression is too long");
  return new ExpressionParser(tokenize(expression)).parse();
}
