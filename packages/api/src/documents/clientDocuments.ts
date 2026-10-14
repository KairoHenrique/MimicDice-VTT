import { deepClone, expandObject, getProperty, getType, mergeObject, setProperty, type PlainObject } from "@tabbletop/common";
import { CONST } from "../constants";
import { Hooks } from "../hooks/Hooks";
import { currentConfig, currentGame } from "../runtime";
import { ClientDocumentMixin } from "./abstract/ClientDocumentMixin";
import { BaseActiveEffect, BaseActor, BaseCombat, BaseCombatant, BaseFolder, BaseItem, BaseJournalEntry, BaseJournalEntryPage } from "./baseDocuments";

const MODES = CONST.ACTIVE_EFFECT_MODES;

interface EffectChange {
  key: string;
  value: string;
  mode: number;
  priority: number;
  effect: ActiveEffect;
}

function castDelta(rawValue: string, currentValue: unknown): unknown {
  const currentType = getType(currentValue);
  if (currentType === "number") return Number(rawValue);
  if (currentType === "boolean") return rawValue === "true";
  if (currentType === "string" || currentType === "null" || currentType === "undefined") {
    if (currentType === "string") return rawValue;
    const numeric = Number(rawValue);
    return Number.isNaN(numeric) || rawValue === "" ? rawValue : numeric;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

function combine(mode: number, current: any, delta: any): unknown {
  switch (mode) {
    case MODES.MULTIPLY:
      return typeof current === "number" ? current * delta : current;
    case MODES.ADD:
      if (Array.isArray(current)) return current.concat(delta);
      return (current ?? (typeof delta === "number" ? 0 : "")) + delta;
    case MODES.DOWNGRADE:
      return current === null || current === undefined ? delta : Math.min(current, delta);
    case MODES.UPGRADE:
      return current === null || current === undefined ? delta : Math.max(current, delta);
    case MODES.OVERRIDE:
      return delta;
    default:
      return current;
  }
}

export class ActiveEffect extends ClientDocumentMixin(BaseActiveEffect) {
  get active(): boolean {
    return !this.disabled && !this.isSuppressed;
  }

  get isSuppressed(): boolean {
    return false;
  }

  get isTemporary(): boolean {
    const duration = (this.duration ?? {}) as PlainObject;
    return Boolean(duration.seconds || duration.rounds || duration.turns) || this.statuses?.size > 0;
  }

  get modifiesActor(): boolean {
    return this.active && (this.parent?.documentName === "Actor" || this.transfer === true);
  }

  get target(): any {
    return this.parent?.documentName === "Actor" ? this.parent : (this.parent?.parent ?? null);
  }

  /** Applies one change to the actor's prepared data and returns the overridden value keyed by path. */
  apply(actor: any, change: EffectChange): PlainObject {
    const current = getProperty(actor, change.key) ?? null;
    const delta = castDelta(change.value, current);
    if (change.mode === MODES.CUSTOM) {
      const changes: PlainObject = {};
      Hooks.call("applyActiveEffect", actor, change, current, delta, changes);
      return changes;
    }
    const result = combine(change.mode, current, delta);
    setProperty(actor, change.key, result);
    return { [change.key]: result };
  }
}

export class Item extends ClientDocumentMixin(BaseItem) {
  get actor(): any {
    return this.parent?.documentName === "Actor" ? this.parent : null;
  }

  get isOwned(): boolean {
    return Boolean(this.actor);
  }

  get transferredEffects(): ActiveEffect[] {
    return this.effects?.filter((effect: ActiveEffect) => effect.transfer === true) ?? [];
  }

  override getRollData(): PlainObject {
    const actorData = this.actor?.getRollData?.() ?? {};
    return { ...actorData, item: this.system };
  }
}

function buildPrototypeToken(stored: PlainObject | undefined, actorSource: PlainObject): PlainObject {
  const defaults: PlainObject = {
    name: actorSource.name ?? "",
    displayName: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    actorLink: false,
    width: 1,
    height: 1,
    texture: { src: actorSource.img || CONST.DEFAULT_TOKEN, anchorX: 0.5, anchorY: 0.5, scaleX: 1, scaleY: 1, tint: "#ffffff" },
    lockRotation: false,
    rotation: 0,
    alpha: 1,
    disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE,
    displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    bar1: { attribute: null },
    bar2: { attribute: null },
    sight: { enabled: false, range: 0 },
    flags: {},
  };
  return mergeObject(defaults, deepClone(stored ?? {}), { inplace: false });
}

export class Actor extends ClientDocumentMixin(BaseActor) {
  declare overrides: PlainObject;
  declare statuses: Set<string>;
  declare prototypeToken: PlainObject;

  get itemTypes(): Record<string, Item[]> {
    const groups: Record<string, Item[]> = Object.fromEntries((currentGame()?.documentTypes?.Item ?? []).map((type: string) => [type, []]));
    for (const item of this.items?.values() ?? []) (groups[item.type] ??= []).push(item);
    return groups;
  }

  get isToken(): boolean {
    return false;
  }

  get token(): null {
    return null;
  }

  get inCombat(): boolean {
    return false;
  }

  get appliedEffects(): ActiveEffect[] {
    return Array.from(this.allApplicableEffects()).filter((effect) => effect.active);
  }

  get temporaryEffects(): ActiveEffect[] {
    return this.appliedEffects.filter((effect) => effect.isTemporary);
  }

  *allApplicableEffects(): Generator<ActiveEffect> {
    for (const effect of this.effects?.values() ?? []) yield effect;
    for (const item of this.items?.values() ?? []) {
      for (const effect of item.effects?.values() ?? []) if (effect.transfer) yield effect;
    }
  }

  getActiveTokens(): unknown[] {
    return [];
  }

  /** `prototypeToken` always exposes the full token defaults, even for actors stored with an empty prototype. */
  override _initialize(options: object = {}): void {
    super._initialize(options);
    this.prototypeToken = buildPrototypeToken(this._source.prototypeToken as PlainObject | undefined, this._source as PlainObject);
  }

  /** Unsaved token document for this actor, built from the prototype plus `data` overrides. */
  async getTokenDocument(data: PlainObject = {}, { parent = currentGame()?.canvas?.scene ?? null }: { parent?: unknown } = {}): Promise<any> {
    const TokenDocumentClass = currentConfig()?.Token?.documentClass;
    const tokenData = mergeObject(deepClone(this.prototypeToken as PlainObject), { ...expandObject(deepClone(data)), actorId: this.id }, { inplace: false });
    return new TokenDocumentClass(tokenData, { parent });
  }

  /** Systems read `statuses` and `overrides` during base-data preparation, before effects are applied. */
  override prepareData(): void {
    this.statuses ??= new Set();
    this.overrides ??= {};
    super.prepareData();
  }

  override prepareEmbeddedDocuments(): void {
    super.prepareEmbeddedDocuments();
    this.applyActiveEffects();
  }

  applyActiveEffects(): void {
    const overrides: PlainObject = {};
    const statuses = new Set<string>();
    const changes: EffectChange[] = [];
    for (const effect of this.allApplicableEffects()) {
      if (!effect.active) continue;
      for (const change of effect.changes ?? []) {
        changes.push({ ...deepClone(change), effect, priority: change.priority ?? change.mode * 10 });
      }
      for (const status of effect.statuses ?? []) statuses.add(status);
    }
    changes.sort((left, right) => left.priority - right.priority);
    for (const change of changes) {
      if (change.key) Object.assign(overrides, change.effect.apply(this, change));
    }
    this.overrides = expandObject(overrides);
    this.statuses = statuses;
  }

  override getRollData(): PlainObject {
    return this.system ?? {};
  }
}

export class Combatant extends ClientDocumentMixin(BaseCombatant) {
  get combat(): any {
    return this.parent;
  }

  get actor(): any {
    return this.actorId ? (currentGame()?.actors?.get(this.actorId) ?? null) : null;
  }

  get token(): any {
    return null;
  }

  override get isOwner(): boolean {
    return Boolean(currentGame()?.user?.isGM || this.actor?.isOwner);
  }

  _getInitiativeFormula(): string {
    return currentConfig()?.Combat?.initiative?.formula || currentGame()?.system?.initiative || "1d20";
  }

  getInitiativeRoll(formula?: string): unknown {
    const RollClass = currentConfig()?.Dice?.rolls?.[0] ?? (globalThis as any).Roll;
    return new RollClass(formula || this._getInitiativeFormula(), this.actor?.getRollData?.() ?? {});
  }

  async rollInitiative(formula?: string): Promise<unknown> {
    const roll: any = this.getInitiativeRoll(formula);
    await roll.evaluate();
    return this.update({ initiative: roll.total });
  }
}

/** Client-side combat encounter model; the world does not persist combats yet, so there is no tracker UI. */
export class Combat extends ClientDocumentMixin(BaseCombat) {
  get combatant(): Combatant | null {
    return this.turns[this.turn ?? -1] ?? null;
  }

  get turns(): Combatant[] {
    const combatants: Combatant[] = Array.from(this.combatants?.values() ?? []);
    return combatants.sort((left, right) => (right.initiative ?? -Infinity) - (left.initiative ?? -Infinity));
  }

  get isActive(): boolean {
    return Boolean(this.active);
  }

  async rollInitiative(ids: string | string[], { formula }: { formula?: string } = {}): Promise<this> {
    for (const id of typeof ids === "string" ? [ids] : ids) {
      const combatant = this.combatants?.get(id);
      if (combatant?.isOwner) await combatant.rollInitiative(formula);
    }
    return this;
  }
}

export class JournalEntryPage extends ClientDocumentMixin(BaseJournalEntryPage) {}

export class JournalEntry extends ClientDocumentMixin(BaseJournalEntry) {}

export class Folder extends ClientDocumentMixin(BaseFolder) {
  get contents(): any[] {
    const collection = currentGame()?.collections?.get(this.type);
    return collection?.filter((document: any) => document._source.folder === this.id) ?? [];
  }

  get children(): Folder[] {
    return currentGame()?.folders?.filter((folder: Folder) => folder._source.folder === this.id) ?? [];
  }

  get depth(): number {
    let depth = 1;
    let ancestor = this.folder;
    while (ancestor && depth < CONST.FOLDER_MAX_DEPTH + 1) {
      depth += 1;
      ancestor = ancestor.folder;
    }
    return depth;
  }
}
