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
    const combat = currentGame()?.combat;
    return Boolean(combat?.combatants?.some?.((combatant: any) => combatant.actorId === this.id));
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
    if (!this.tokenId) return null;
    return currentGame()?.scenes?.get(this.sceneId)?.tokens?.get(this.tokenId) ?? null;
  }

  override get isOwner(): boolean {
    return Boolean(currentGame()?.user?.isGM || this.actor?.isOwner);
  }

  get isNPC(): boolean {
    return !this.actor?.hasPlayerOwner;
  }

  get isDefeated(): boolean {
    return Boolean(this.defeated);
  }

  get visible(): boolean {
    return this.isOwner || !this.hidden;
  }

  _getInitiativeFormula(): string {
    return currentConfig()?.Combat?.initiative?.formula || currentGame()?.system?.initiative || "1d20";
  }

  getInitiativeRoll(formula?: string): unknown {
    const RollClass = currentConfig()?.Dice?.rolls?.[0] ?? (globalThis as any).Roll;
    return new RollClass(formula || this._getInitiativeFormula(), this.actor?.getRollData?.() ?? {});
  }

  /** Hidden or GM-controlled combatants roll privately, so players do not learn about enemies early. */
  async rollInitiative(formula?: string): Promise<unknown> {
    const roll: any = this.getInitiativeRoll(formula);
    await roll.evaluate();
    const updated = await this.update({ initiative: roll.total });
    const isPrivate = this.hidden || (this.isNPC && Boolean(currentGame()?.user?.isGM));
    await roll.toMessage?.({ speaker: { actor: this.actorId ?? null, alias: this.name }, flavor: `${this.name} rolou iniciativa` }, { rollMode: isPrivate ? "gmroll" : "publicroll" });
    return updated;
  }
}

/** Highest initiative first; combatants still waiting to roll go last; ties keep a stable alphabetical order. */
function compareTurnOrder(left: Combatant, right: Combatant): number {
  const leftInitiative = left.initiative ?? -Infinity;
  const rightInitiative = right.initiative ?? -Infinity;
  if (leftInitiative !== rightInitiative) return rightInitiative - leftInitiative;
  return String(left.name ?? "").localeCompare(String(right.name ?? ""), "pt-BR") || String(left.id).localeCompare(String(right.id));
}

/** In a manual order the GM's arrangement (`sort`) decides; initiative only breaks ties such as newcomers. */
function compareManualOrder(left: Combatant, right: Combatant): number {
  return (Number(left.sort) || 0) - (Number(right.sort) || 0) || compareTurnOrder(left, right);
}

const MANUAL_ORDER_FLAG = "manualTurnOrder";
const ORDER_FLAG_SCOPE = "world";
const SORT_STEP = 10;

/** A combat encounter: turn order by initiative (or the GM's manual order), rounds, and the GM's controls to run it. */
export class Combat extends ClientDocumentMixin(BaseCombat) {
  get hasManualOrder(): boolean {
    return this._source.flags?.[ORDER_FLAG_SCOPE]?.[MANUAL_ORDER_FLAG] === true;
  }

  /** `sort` for a combatant joining a manual order, so it goes after everyone already placed. */
  get nextManualSort(): number {
    const sorts = Array.from(this.combatants?.values() ?? [], (combatant: any) => Number(combatant.sort) || 0);
    return (sorts.length > 0 ? Math.max(...sorts) : 0) + SORT_STEP;
  }

  /**
   * Rearranges the turns to `orderedIds` and switches to manual order. The turn stays with the same combatant,
   * unless `passTurnFrom` is the acting one: then the turn goes to whoever came right after it before the change.
   */
  async setTurnOrder(orderedIds: string[], { passTurnFrom }: { passTurnFrom?: string } = {}): Promise<unknown> {
    const before = this.turns;
    const known = new Set(before.map((combatant) => combatant.id));
    const ids = [...orderedIds.filter((id) => known.has(id)), ...before.map((combatant) => combatant.id).filter((id) => !orderedIds.includes(id))];
    let currentId = this.combatant?.id ?? null;
    if (passTurnFrom && passTurnFrom === currentId) {
      const followers = before.slice(before.findIndex((combatant) => combatant.id === currentId) + 1);
      currentId = followers[0]?.id ?? currentId;
    }
    await this.updateEmbeddedDocuments(
      "Combatant",
      ids.map((id, index) => ({ _id: id, sort: (index + 1) * SORT_STEP })),
    );
    const turn = currentId ? ids.indexOf(currentId) : null;
    return this.update({ [`flags.${ORDER_FLAG_SCOPE}.${MANUAL_ORDER_FLAG}`]: true, ...(this.started && turn !== null && turn >= 0 ? { turn, currentCombatantId: currentId } : {}) });
  }

  /** Moves one combatant to `index` in the turn order (0 = acts first). */
  async moveCombatant(combatantId: string, index: number): Promise<unknown> {
    const ids = this.turns.map((combatant) => combatant.id).filter((id) => id !== combatantId);
    ids.splice(Math.min(Math.max(index, 0), ids.length), 0, combatantId);
    return this.setTurnOrder(ids);
  }

  /** "Ficou tonto": the combatant drops to the end of the order; if it was acting, the next one acts now. */
  async delayToEnd(combatantId: string): Promise<unknown> {
    const ids = this.turns.map((combatant) => combatant.id).filter((id) => id !== combatantId);
    return this.setTurnOrder([...ids, combatantId], { passTurnFrom: combatantId });
  }

  /** Back to ordering by initiative, keeping the turn with the same combatant. */
  async sortByInitiative(): Promise<unknown> {
    const currentId = this.combatant?.id ?? null;
    const ordered: Combatant[] = Array.from(this.combatants?.values() ?? []) as Combatant[];
    ordered.sort(compareTurnOrder);
    const turn = currentId ? ordered.findIndex((combatant) => combatant.id === currentId) : -1;
    return this.update({ [`flags.${ORDER_FLAG_SCOPE}.-=${MANUAL_ORDER_FLAG}`]: null, ...(this.started && turn >= 0 ? { turn } : {}) });
  }

  /** Players do not receive hidden combatants, so the turn is tracked by id rather than by position in their list. */
  get combatant(): Combatant | null {
    const currentId = this._source.currentCombatantId;
    if (currentId) return this.combatants?.get(currentId) ?? null;
    return this.turns[this.turn ?? -1] ?? null;
  }

  #turnUpdate(round: number, index: number): PlainObject {
    const turns = this.turns;
    const bounded = turns.length === 0 ? null : Math.min(Math.max(index, 0), turns.length - 1);
    return { round, turn: bounded, currentCombatantId: bounded === null ? null : turns[bounded].id };
  }

  #currentIndex(): number {
    const current = this.combatant;
    return current ? this.turns.indexOf(current) : (this.turn ?? -1);
  }

  get turns(): Combatant[] {
    const combatants: Combatant[] = Array.from(this.combatants?.values() ?? []);
    return combatants.sort(this.hasManualOrder ? compareManualOrder : compareTurnOrder);
  }

  get isActive(): boolean {
    return Boolean(this.active);
  }

  get previous(): { round: number; turn: number | null } {
    return { round: this.round, turn: this.turn };
  }

  async rollInitiative(ids: string | string[], { formula }: { formula?: string } = {}): Promise<this> {
    for (const id of typeof ids === "string" ? [ids] : ids) {
      const combatant = this.combatants?.get(id);
      if (combatant?.isOwner) await combatant.rollInitiative(formula);
    }
    return this;
  }

  async rollAll(options: { formula?: string } = {}): Promise<this> {
    const pending = this.turns.filter((combatant) => combatant.isOwner && combatant.initiative === null);
    return this.rollInitiative(pending.map((combatant) => combatant.id), options);
  }

  async rollNPC(options: { formula?: string } = {}): Promise<this> {
    const pending = this.turns.filter((combatant) => combatant.isOwner && combatant.isNPC && combatant.initiative === null);
    return this.rollInitiative(pending.map((combatant) => combatant.id), options);
  }

  async resetAll(): Promise<unknown> {
    const updates = this.turns.map((combatant) => ({ _id: combatant.id, initiative: null }));
    await this.updateEmbeddedDocuments("Combatant", updates);
    return this.started ? this.update(this.#turnUpdate(this.round, 0)) : this.update({ turn: null, currentCombatantId: null });
  }

  async startCombat(): Promise<unknown> {
    return this.update({ started: true, active: true, ...this.#turnUpdate(1, 0) });
  }

  async nextTurn(): Promise<unknown> {
    const count = this.turns.length;
    if (count === 0) return this;
    const next = this.#currentIndex() + 1;
    if (next >= count) return this.nextRound();
    return this.update(this.#turnUpdate(this.round, next));
  }

  async previousTurn(): Promise<unknown> {
    const current = this.#currentIndex();
    if (current > 0) return this.update(this.#turnUpdate(this.round, current - 1));
    if (this.round <= 1) return this;
    return this.update(this.#turnUpdate(this.round - 1, this.turns.length - 1));
  }

  async nextRound(): Promise<unknown> {
    return this.update(this.#turnUpdate(this.round + 1, 0));
  }

  async previousRound(): Promise<unknown> {
    return this.update(this.#turnUpdate(Math.max(this.round - 1, 1), 0));
  }

  async endCombat(): Promise<unknown> {
    return this.delete();
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
