import type { PlainObject } from "./objectUtils";

export const WALL_DOOR_TYPE_NONE = 0;
export const DOOR_STATES = { CLOSED: 0, OPEN: 1, LOCKED: 2 } as const;
export const DOOR_KEY_FLAG_SCOPE = "world";
export const DOOR_KEY_FLAG = "requiredItem";
export const MAX_DOOR_KEY_NAME_LENGTH = 80;

/** Case, accents' composition and repeated spaces do not matter when comparing an item to a door's key. */
export function normalizeItemName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR").slice(0, MAX_DOOR_KEY_NAME_LENGTH);
}

/** Name of the item a door asks for, or null when anyone allowed to use doors may open it. */
export function requiredDoorItem(wallSource: PlainObject | null | undefined): string | null {
  const flags = wallSource?.flags as PlainObject | undefined;
  const scope = flags?.[DOOR_KEY_FLAG_SCOPE] as PlainObject | undefined;
  const name = scope?.[DOOR_KEY_FLAG];
  if (typeof name !== "string" || normalizeItemName(name) === "") return null;
  return name.trim().slice(0, MAX_DOOR_KEY_NAME_LENGTH);
}

export function itemNamesMatch(itemName: unknown, requiredName: string): boolean {
  const normalized = normalizeItemName(itemName);
  return normalized !== "" && normalized === normalizeItemName(requiredName);
}
