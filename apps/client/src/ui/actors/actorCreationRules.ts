import type { ActorRole } from "@tabbletop/protocol";

export const MAX_ACTORS_PER_CREATION = 20;

const PREFERRED_TYPES: Readonly<Record<ActorRole, readonly string[]>> = { player: ["character", "pc", "hero"], enemy: ["npc", "monster", "creature"], npc: ["npc", "character"] };

/** Picks the system's actor type that best matches the role, skipping internal ones such as "_template". */
export function actorTypeFor(role: ActorRole, availableTypes: readonly string[]): string {
  const usable = availableTypes.filter((type) => !type.startsWith("_"));
  const candidates = usable.length > 1 ? usable.filter((type) => type !== "base") : usable;
  return PREFERRED_TYPES[role].find((type) => candidates.includes(type)) ?? candidates[0] ?? "base";
}

export function clampQuantity(quantity: number): number {
  return Math.min(MAX_ACTORS_PER_CREATION, Math.max(1, Math.round(Number.isFinite(quantity) ? quantity : 1)));
}

export function numberedNames(name: string, quantity: number): string[] {
  const count = clampQuantity(quantity);
  if (count === 1) return [name];
  return Array.from({ length: count }, (_, index) => `${name} ${index + 1}`);
}
