import { cryptoUniform, MersenneTwister } from "./MersenneTwister";
import { Roll } from "./Roll";
import { RollParser } from "./RollParser";
import { FunctionTerm, ParentheticalTerm, PoolTerm } from "./terms/compositeTerms";
import { DiceTerm } from "./terms/DiceTerm";
import { Coin, Die, FateDie } from "./terms/Die";
import { NumericTerm, OperatorTerm, RollTerm, StringTerm } from "./terms/RollTerm";

export { Coin, DiceTerm, Die, FateDie, FunctionTerm, MersenneTwister, NumericTerm, OperatorTerm, ParentheticalTerm, PoolTerm, Roll, RollParser, RollTerm, StringTerm };

export const DICE_TERMS = { Coin, DiceTerm, Die, FateDie, FunctionTerm, NumericTerm, OperatorTerm, ParentheticalTerm, PoolTerm, RollTerm, StringTerm };

export function createDiceNamespace() {
  return { Roll, RollParser, RollGrammar: RollParser, MersenneTwister, terms: { ...DICE_TERMS } };
}

export function configureDice(config: Record<string, any>): void {
  config.Dice = {
    ...(config.Dice ?? {}),
    types: [Die, FateDie],
    rolls: [Roll],
    termTypes: { DiceTerm, FunctionTerm, NumericTerm, OperatorTerm, ParentheticalTerm, PoolTerm, StringTerm },
    terms: { c: Coin, d: Die, f: FateDie },
    randomUniform: cryptoUniform,
    fulfillment: { dice: {}, methods: {}, defaultMethod: "digital", ...(config.Dice?.fulfillment ?? {}) },
  };
  config.sounds = { dice: null, lock: null, notification: null, combat: null, ...(config.sounds ?? {}) };
}
