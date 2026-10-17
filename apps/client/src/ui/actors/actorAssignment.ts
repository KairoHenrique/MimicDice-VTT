import { CONST } from "@tabbletop/api";
import type { ActorRole, SheetLayout, SheetTemplate } from "@tabbletop/protocol";
import { cloneLayoutWithNewIds, missingSystemData } from "../sheets/layout/sheetLayoutRules";
import { SheetValueStore } from "../sheets/layout/sheetValueRoot";
import { LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE, playerOwnersOf, ROLE_FLAG_KEY } from "./actorRoles";

const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

/** Player characters are linked tokens with vision; enemies are hostile copies, so each goblin keeps its own HP. */
export function roleTokenDefaults(role: ActorRole): Record<string, unknown> {
  const dispositions = CONST.TOKEN_DISPOSITIONS;
  const disposition = role === "player" ? dispositions.FRIENDLY : role === "enemy" ? dispositions.HOSTILE : dispositions.NEUTRAL;
  return { actorLink: role === "player", disposition, sight: { enabled: role === "player" } };
}

function layoutUpdate(actor: any, layout: SheetLayout): Record<string, unknown> {
  const store = new SheetValueStore(actor);
  const changes: Record<string, unknown> = { [`flags.${MIMICDICE_FLAG_SCOPE}.${LAYOUT_FLAG_KEY}`]: layout };
  for (const [key, value] of Object.entries(missingSystemData(layout, store.values()))) changes[store.pathOf(key)] = value;
  return changes;
}

export async function saveActorLayout(actor: any, layout: SheetLayout): Promise<void> {
  await actor.update(layoutUpdate(actor, layout));
}

/** Replaces the actor's layout with the template's; values already typed are kept. */
export async function applyTemplateToActor(actor: any, template: SheetTemplate): Promise<void> {
  await saveActorLayout(actor, cloneLayoutWithNewIds(template.layout));
}

export async function changeActorRole(actor: any, role: ActorRole): Promise<void> {
  await actor.update({
    [`flags.${MIMICDICE_FLAG_SCOPE}.${ROLE_FLAG_KEY}`]: role,
    "prototypeToken.actorLink": roleTokenDefaults(role).actorLink,
    "prototypeToken.disposition": roleTokenDefaults(role).disposition,
    "prototypeToken.sight": roleTokenDefaults(role).sight,
  });
}

/** Makes `userId` the only player owning the actor (GMs always see everything) and sets it as their character if they have none. */
export async function assignPlayerOwner(actor: any, userId: string | null): Promise<void> {
  const changes: Record<string, unknown> = {};
  const previousOwners = playerOwnersOf(actor).filter((user: any) => user.id !== userId);
  for (const user of previousOwners) changes[`ownership.-=${user.id}`] = null;
  if (userId) changes[`ownership.${userId}`] = OWNER;
  if (Object.keys(changes).length > 0) await actor.update(changes);
  for (const user of previousOwners) {
    if (user.character?.id === actor.id) await user.update({ character: null });
  }
  const newOwner = userId ? game.users.get(userId) : null;
  if (newOwner && !newOwner.character) await newOwner.update({ character: actor.id });
}
