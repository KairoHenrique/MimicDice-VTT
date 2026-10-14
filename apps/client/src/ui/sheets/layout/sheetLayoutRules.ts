import { SHEET_FIELD_KEY_PATTERN, storedSheetLayoutSchema, type SheetComponent, type SheetLayout } from "@tabbletop/protocol";
import { storesValue } from "./componentCatalog";
import { migrateLegacyLayout } from "./legacyLayoutMigration";

const MAX_KEY_LENGTH = 40;

export const EMPTY_LAYOUT: SheetLayout = Object.freeze({ version: 2, pages: [{ id: "main", title: "Ficha", components: [] }] }) as SheetLayout;

export function newLocalId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

/** Turns a label such as "Força de Vontade" into a roll-data key ("forca_de_vontade") not yet in `takenKeys`. */
export function keyFromLabel(label: string, takenKeys: ReadonlySet<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^[^a-z]+/, "")
      .replace(/_+$/, "")
      .slice(0, MAX_KEY_LENGTH) || "campo";
  if (!takenKeys.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base.slice(0, MAX_KEY_LENGTH - String(suffix).length - 1)}_${suffix}`;
    if (!takenKeys.has(candidate)) return candidate;
  }
}

export function isValidFieldKey(key: string): boolean {
  return SHEET_FIELD_KEY_PATTERN.test(key);
}

/** Layouts come from document flags any owner can write, so they are validated (and upgraded) before every render. */
export function readLayout(raw: unknown): SheetLayout | null {
  const parsed = storedSheetLayoutSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.version === 2 ? parsed.data : migrateLegacyLayout(parsed.data);
}

export function allComponents(layout: SheetLayout): SheetComponent[] {
  return layout.pages.flatMap((page) => page.components);
}

export function layoutKeys(layout: SheetLayout): Set<string> {
  const keys = new Set<string>();
  for (const component of allComponents(layout)) if (component.key) keys.add(component.key);
  return keys;
}

function numericInitial(component: SheetComponent): number {
  return typeof component.initial === "number" ? component.initial : 0;
}

/** Starting stored value for one component; display-only kinds store nothing. */
export function initialValueFor(component: SheetComponent): unknown {
  switch (component.kind) {
    case "number":
    case "pips":
      return numericInitial(component);
    case "resource":
      return { value: numericInitial(component), max: numericInitial(component) };
    case "checkbox":
      return component.initial === true;
    case "select":
      return typeof component.initial === "string" && component.options?.includes(component.initial) ? component.initial : (component.options?.[0] ?? "");
    case "text":
    case "longtext":
      return typeof component.initial === "string" ? component.initial : "";
    case "list":
      return [];
    default:
      return undefined;
  }
}

/** Stored entries a layout needs that the actor does not have yet; existing values are never overwritten. */
export function missingSystemData(layout: SheetLayout, stored: Record<string, unknown>): Record<string, unknown> {
  const missing: Record<string, unknown> = {};
  for (const component of allComponents(layout)) {
    if (!component.key || !storesValue(component.kind) || component.key in stored || component.key in missing) continue;
    const initial = initialValueFor(component);
    if (initial !== undefined) missing[component.key] = initial;
  }
  return missing;
}

/** Roll buttons always roll; numbers only when the GM marked them rollable and gave a formula. */
export function rollFormulaFor(component: SheetComponent): string | null {
  if (component.kind === "roll") return component.formula || null;
  if (component.kind === "number" && component.rollable !== false) return component.formula || null;
  return null;
}

/** Deep copy with fresh ids, so a template applied twice never shares ids between actors. */
export function cloneLayoutWithNewIds(layout: SheetLayout): SheetLayout {
  return {
    version: 2,
    pages: layout.pages.map((page) => ({ ...page, id: newLocalId(), components: page.components.map((component) => ({ ...structuredClone(component), id: newLocalId() })) })),
  };
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
