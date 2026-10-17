import { CONST } from "@tabbletop/api";

export interface OwnershipChoice {
  level: number;
  /** Short label on the picker buttons. */
  label: string;
  /** Longer explanation under the active choice / for tooltips. */
  hint: string;
  icon: string;
}

const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;

export const OWNERSHIP_CHOICES: readonly OwnershipChoice[] = Object.freeze([
  { level: LEVELS.NONE, label: "Oculto", hint: "Não chega no navegador do jogador", icon: "fa-solid fa-eye-slash" },
  { level: LEVELS.LIMITED, label: "Só nome", hint: "Vê só o nome e a imagem", icon: "fa-solid fa-eye-low-vision" },
  { level: LEVELS.OBSERVER, label: "Ver", hint: "Lê tudo, sem poder editar", icon: "fa-solid fa-eye" },
  { level: LEVELS.OWNER, label: "Editar", hint: "Pode alterar o documento", icon: "fa-solid fa-pen" },
]);

export const INHERIT_CHOICE: OwnershipChoice = Object.freeze({
  level: LEVELS.INHERIT,
  label: "Igual a todos",
  hint: "Usa o mesmo acesso de Todos os jogadores",
  icon: "fa-solid fa-arrow-turn-up",
});

export function ownershipChoiceFor(level: number | undefined): OwnershipChoice {
  return OWNERSHIP_CHOICES.find((choice) => choice.level === level) ?? INHERIT_CHOICE;
}

/** Short description of who sees a document, for directory badges. */
export function describeVisibility(ownership: Record<string, number> | undefined): OwnershipChoice {
  const defaultLevel = ownership?.default ?? LEVELS.NONE;
  const hasPlayerOverrides = Object.entries(ownership ?? {}).some(([userId, level]) => userId !== "default" && level > defaultLevel && !game.users.get(userId)?.isGM);
  const choice = ownershipChoiceFor(defaultLevel);
  return hasPlayerOverrides && defaultLevel === LEVELS.NONE
    ? { ...choice, label: "Oculto (exceto jogadores escolhidos)", hint: choice.hint, icon: "fa-solid fa-user-lock" }
    : choice;
}
