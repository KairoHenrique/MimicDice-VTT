import type { SheetComponent, SheetLayout } from "@tabbletop/protocol";
import { computeDerivedValues, evaluateSheetExpression } from "./computedValues";
import { formulaAliases } from "./formulaAliases";
import { allComponents } from "./sheetLayoutRules";
import { SheetValueStore } from "./sheetValueRoot";

/** Everything a component needs to render for one actor: where values live, who may edit and derived numbers. */
export class BoardContext {
  readonly store: SheetValueStore;
  readonly derived: Readonly<Record<string, number>>;
  readonly #aliases: Readonly<Record<string, number>>;

  constructor(
    readonly actor: any,
    layout: SheetLayout,
    readonly editable: boolean,
  ) {
    this.store = new SheetValueStore(actor);
    const components = allComponents(layout);
    this.#aliases = formulaAliases(components, this.store.values());
    this.derived = computeDerivedValues(components, this.#baseRollData());
  }

  #baseRollData(): Record<string, unknown> {
    return { ...(this.actor.getRollData?.() ?? {}), ...this.store.values(), ...this.store.extraRollData(), ...this.#aliases };
  }

  /** Extra `@refs` for sheet rolls: stored values, checkbox/option numbers, and calculated components. */
  extraRollData(): Record<string, unknown> {
    return { ...this.store.values(), ...this.store.extraRollData(), ...this.#aliases, ...this.derived };
  }

  /** Dice-free formula over the sheet's values and calculations; null when it is invalid. */
  evaluate(formula: string): number | null {
    return evaluateSheetExpression(formula, { ...this.#baseRollData(), ...this.derived });
  }

  /** A whole-number limit from the component's max formula, clamped; the fixed fallback when there is none or it fails. */
  limitFrom(component: SheetComponent, fallback: number, minimum: number, maximum: number): number {
    const computed = component.maxFormula ? this.evaluate(component.maxFormula) : null;
    const value = computed ?? fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(value)));
  }

  /** GM-only components are hidden from players entirely, not just disabled. */
  isVisible(component: SheetComponent): boolean {
    return !component.gmOnly || game.user.isGM;
  }
}
