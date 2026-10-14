import { MAX_SHEET_SKILLS, type SheetSkill } from "@tabbletop/protocol";
import { keyFromLabel } from "./sheetLayoutRules";

const MAX_SKILL_LABEL_LENGTH = 60;

export const DEFAULT_SKILL_LABELS: readonly string[] = Object.freeze([
  "Acrobacia", "Adestramento", "Artes", "Atletismo", "Atualidades", "Ciências", "Crime", "Diplomacia", "Enganação",
  "Fortitude", "Furtividade", "Iniciativa", "Intimidação", "Intuição", "Investigação", "Luta", "Medicina", "Ocultismo",
  "Percepção", "Pilotagem", "Pontaria", "Reflexos", "Religião", "Sobrevivência", "Tática", "Tecnologia", "Vontade",
]);

/**
 * Skills from the names the GM typed, one per line. A name that already existed keeps its key,
 * so renaming or reordering the others never moves a character's stored points.
 */
export function skillsFromLabels(labels: readonly string[], existing: readonly SheetSkill[] = []): SheetSkill[] {
  const keyByLabel = new Map(existing.map((skill) => [skill.label.toLocaleLowerCase(), skill.key]));
  const seenLabels = new Set<string>();
  const cleaned = labels
    .map((label) => label.trim().slice(0, MAX_SKILL_LABEL_LENGTH))
    .filter((label) => {
      const normalized = label.toLocaleLowerCase();
      if (!label || seenLabels.has(normalized)) return false;
      seenLabels.add(normalized);
      return true;
    })
    .slice(0, MAX_SHEET_SKILLS);
  const takenKeys = new Set(cleaned.map((label) => keyByLabel.get(label.toLocaleLowerCase())).filter((key): key is string => Boolean(key)));
  return cleaned.map((label) => {
    const kept = keyByLabel.get(label.toLocaleLowerCase());
    if (kept) return { key: kept, label };
    const key = keyFromLabel(label, takenKeys);
    takenKeys.add(key);
    return { key, label };
  });
}

/** Stored points per skill; anything missing or not a finite number counts as `fallback`. */
export function readSkillValues(raw: unknown, skills: readonly SheetSkill[], fallback = 0): Record<string, number> {
  const stored = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(skills.map((skill) => {
    const value = stored[skill.key];
    return [skill.key, typeof value === "number" && Number.isFinite(value) ? value : fallback];
  }));
}

export function skillPointsTotal(values: Readonly<Record<string, number>>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}
