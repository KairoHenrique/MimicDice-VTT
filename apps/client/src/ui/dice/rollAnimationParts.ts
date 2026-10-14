const OPERATOR_SYMBOLS: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", "%": "%" };
const MAX_BONUS_CHIPS = 6;

export interface AnimatedDiePart {
  term: any;
  result: any;
  discarded: boolean;
}

export interface RollAnimationParts {
  dice: AnimatedDiePart[];
  /** Fixed numbers of the formula with their operator, e.g. "+5" and "−1" for 1d20 + 5 - 1. */
  bonuses: string[];
}

function isDiceTerm(term: any): boolean {
  return Array.isArray(term?.results) && term?.faces !== undefined;
}

function nestedRolls(term: any): any[] {
  if (Array.isArray(term?.rolls)) return term.rolls;
  return term?.roll ? [term.roll] : [];
}

function collectDice(terms: any[], discardedByParent: boolean, into: AnimatedDiePart[], limit: number): void {
  for (const term of terms ?? []) {
    if (into.length >= limit) return;
    if (isDiceTerm(term)) {
      for (const result of term.results) {
        if (result?.hidden || into.length >= limit) continue;
        into.push({ term, result, discarded: discardedByParent || result?.active === false });
      }
      continue;
    }
    nestedRolls(term).forEach((roll: any, index: number) => {
      const discarded = discardedByParent || term.results?.[index]?.active === false;
      collectDice(roll?.terms ?? [], discarded, into, limit);
    });
  }
}

function collectBonuses(terms: any[], into: string[]): void {
  let operator = "+";
  for (const term of terms ?? []) {
    if (typeof term?.operator === "string") {
      operator = term.operator;
      continue;
    }
    if (!isDiceTerm(term) && typeof term?.number === "number" && into.length < MAX_BONUS_CHIPS) into.push(`${OPERATOR_SYMBOLS[operator] ?? "+"}${term.number}`);
    operator = "+";
  }
}

/** Dice to animate (a pool's discarded rolls dim their dice) and the formula's fixed bonuses. */
export function rollAnimationParts(rolls: any[], maxDice: number): RollAnimationParts {
  const dice: AnimatedDiePart[] = [];
  const bonuses: string[] = [];
  for (const roll of rolls ?? []) {
    collectDice(roll?.terms ?? [], false, dice, maxDice);
    collectBonuses(roll?.terms ?? [], bonuses);
  }
  return { dice, bonuses };
}
