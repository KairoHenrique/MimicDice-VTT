import { CONST } from "@tabbletop/api";

export interface OwnershipChoice {
  level: number;
  label: string;
  icon: string;
}

const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;

export const OWNERSHIP_CHOICES: readonly OwnershipChoice[] = Object.freeze([
  { level: LEVELS.NONE, label: "Oculto", icon: "fa-solid fa-eye-slash" },
  { level: LEVELS.LIMITED, label: "Limitado (só nome e imagem)", icon: "fa-solid fa-eye-low-vision" },
  { level: LEVELS.OBSERVER, label: "Observador (vê tudo)", icon: "fa-solid fa-eye" },
  { level: LEVELS.OWNER, label: "Dono (pode editar)", icon: "fa-solid fa-feather-pointed" },
]);

export const INHERIT_CHOICE: OwnershipChoice = Object.freeze({ level: LEVELS.INHERIT, label: "Padrão", icon: "fa-solid fa-arrow-turn-up" });

export function ownershipChoiceFor(level: number | undefined): OwnershipChoice {
  return OWNERSHIP_CHOICES.find((choice) => choice.level === level) ?? INHERIT_CHOICE;
}

/** Short description of who sees a document, for directory badges. */
export function describeVisibility(ownership: Record<string, number> | undefined): OwnershipChoice {
  const defaultLevel = ownership?.default ?? LEVELS.NONE;
  const hasPlayerOverrides = Object.entries(ownership ?? {}).some(([userId, level]) => userId !== "default" && level > defaultLevel && !game.users.get(userId)?.isGM);
  const choice = ownershipChoiceFor(defaultLevel);
  return hasPlayerOverrides && defaultLevel === LEVELS.NONE ? { ...choice, label: "Oculto (exceto jogadores escolhidos)", icon: "fa-solid fa-user-lock" } : choice;
}
