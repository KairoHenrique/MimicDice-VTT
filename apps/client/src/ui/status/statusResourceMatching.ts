import type { SheetComponent, StatusResource } from "@tabbletop/protocol";
import { keyFromLabel } from "../sheets/layout/sheetLayoutRules";

const NO_TAKEN_KEYS: ReadonlySet<string> = new Set();
const READABLE_KINDS: ReadonlySet<string> = new Set(["resource", "number"]);

/** "Pontos de Vida", "pontos_de_vida" and "PONTOS DE VIDA" all become "pontos_de_vida". */
export function normalizeResourceName(name: string): string {
  return keyFromLabel(name, NO_TAKEN_KEYS);
}

/** Splits what the GM typed ("vida, hp; PV") into normalized names, without duplicates. */
export function parseAliases(text: string): string[] {
  const names = text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizeResourceName);
  return Array.from(new Set(names));
}

function matchesAnyName(component: SheetComponent, names: ReadonlySet<string>): boolean {
  return names.has(normalizeResourceName(component.key ?? "")) || names.has(normalizeResourceName(component.label ?? ""));
}

/** For each enabled resource, the first sheet bar whose key or label matches one of its names; a plain number field when there is no bar. */
export function matchResourceComponents(components: readonly SheetComponent[], resources: readonly StatusResource[]): Map<string, SheetComponent> {
  const candidates = components.filter((component) => READABLE_KINDS.has(component.kind) && component.key);
  const matches = new Map<string, SheetComponent>();
  for (const resource of resources) {
    if (!resource.enabled) continue;
    const names = new Set([resource.label, ...resource.aliases].map(normalizeResourceName));
    const named = candidates.filter((component) => matchesAnyName(component, names));
    const match = named.find((component) => component.kind === "resource") ?? named[0];
    if (match) matches.set(resource.id, match);
  }
  return matches;
}

export interface SheetFieldOption {
  key: string;
  label: string;
  kind: "resource" | "number";
}

/** Distinct bar and number fields across the given layouts, for the GM to pick what the panel shows. */
export function collectSheetFields(componentLists: Iterable<readonly SheetComponent[]>): SheetFieldOption[] {
  const fields = new Map<string, SheetFieldOption>();
  for (const components of componentLists) {
    for (const component of components) {
      if (!READABLE_KINDS.has(component.kind) || !component.key) continue;
      const key = normalizeResourceName(component.key);
      if (fields.has(key)) continue;
      fields.set(key, { key, label: component.label?.trim() || component.key, kind: component.kind as SheetFieldOption["kind"] });
    }
  }
  return [...fields.values()].sort((left, right) => Number(right.kind === "resource") - Number(left.kind === "resource") || left.label.localeCompare(right.label, "pt-BR"));
}
