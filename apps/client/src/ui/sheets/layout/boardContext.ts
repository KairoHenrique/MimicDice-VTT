import type { SheetComponent, SheetLayout } from "@tabbletop/protocol";
import { computeDerivedValues } from "./computedValues";
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
    return { ...this.store.extraRollData(), ...(this.actor.getRollData?.() ?? {}), ...this.#aliases };
  }

  /** Extra `@refs` for sheet rolls: flag-stored values, checkbox and option numbers, and calculated components. */
  extraRollData(): Record<string, unknown> {
    return { ...this.store.extraRollData(), ...this.#aliases, ...this.derived };
  }

  /** GM-only components are hidden from players entirely, not just disabled. */
  isVisible(component: SheetComponent): boolean {
    return !component.gmOnly || game.user.isGM;
  }
}
