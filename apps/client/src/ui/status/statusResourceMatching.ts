import type { SheetComponent, StatusResource } from "@tabbletop/protocol";
import { keyFromLabel } from "../sheets/layout/sheetLayoutRules";

const NO_TAKEN_KEYS: ReadonlySet<string> = new Set();

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

/** For each enabled resource, the first sheet bar whose key or label matches one of its names. */
export function matchResourceComponents(components: readonly SheetComponent[], resources: readonly StatusResource[]): Map<string, SheetComponent> {
  const bars = components.filter((component) => component.kind === "resource" && component.key);
  const matches = new Map<string, SheetComponent>();
  for (const resource of resources) {
    if (!resource.enabled) continue;
    const names = new Set([resource.label, ...resource.aliases].map(normalizeResourceName));
    const match = bars.find((component) => names.has(normalizeResourceName(component.key ?? "")) || names.has(normalizeResourceName(component.label ?? "")));
    if (match) matches.set(resource.id, match);
  }
  return matches;
}
