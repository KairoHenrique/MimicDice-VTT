import type { SheetComponent, SheetLayout } from "@tabbletop/protocol";
import { computeDerivedValues } from "./computedValues";
import { allComponents } from "./sheetLayoutRules";
import { SheetValueStore } from "./sheetValueRoot";

/** Everything a component needs to render for one actor: where values live, who may edit and derived numbers. */
export class BoardContext {
  readonly store: SheetValueStore;
  readonly derived: Readonly<Record<string, number>>;

  constructor(
    readonly actor: any,
    layout: SheetLayout,
    readonly editable: boolean,
  ) {
    this.store = new SheetValueStore(actor);
    this.derived = computeDerivedValues(allComponents(layout), this.#baseRollData());
  }

  #baseRollData(): Record<string, unknown> {
    return { ...this.store.extraRollData(), ...(this.actor.getRollData?.() ?? {}) };
  }

  /** Extra `@refs` for sheet rolls: flag-stored values and calculated components. */
  extraRollData(): Record<string, unknown> {
    return { ...this.store.extraRollData(), ...this.derived };
  }

  /** GM-only components are hidden from players entirely, not just disabled. */
  isVisible(component: SheetComponent): boolean {
    return !component.gmOnly || game.user.isGM;
  }
}
