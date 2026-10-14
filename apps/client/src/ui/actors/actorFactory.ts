import type { ActorRole } from "@tabbletop/protocol";
import { MIMICDICE_ACTOR_SHEET_ID } from "../../game/coreSheets";
import { cloneLayoutWithNewIds, EMPTY_LAYOUT, missingSystemData } from "../sheets/layout/sheetLayoutRules";
import { findSheetTemplate } from "../sheets/layout/sheetTemplateStore";
import { sourceAtRoot, valueRootForActorType } from "../sheets/layout/sheetValueRoot";
import { roleTokenDefaults } from "./actorAssignment";
import { addActorsToCategory } from "./actorCategoryStore";
import { actorTypeFor, numberedNames } from "./actorCreationRules";
import { LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE, ROLE_FLAG_KEY } from "./actorRoles";

const OWNER_LEVEL = 3;

export interface ActorCreationRequest {
  name: string;
  img: string;
  role: ActorRole;
  templateId: string;
  ownerId: string | null;
  quantity: number;
  categoryIds: readonly string[];
}

function actorSource(request: ActorCreationRequest, name: string): Record<string, unknown> {
  const template = findSheetTemplate(request.templateId);
  const layout = template ? cloneLayoutWithNewIds(template.layout) : EMPTY_LAYOUT;
  const type = actorTypeFor(request.role, CONFIG.Actor.documentClass.TYPES);
  const base: Record<string, unknown> = {
    name,
    type,
    flags: { [MIMICDICE_FLAG_SCOPE]: { [ROLE_FLAG_KEY]: request.role, [LAYOUT_FLAG_KEY]: layout }, core: { sheetClass: MIMICDICE_ACTOR_SHEET_ID } },
    prototypeToken: { name, ...roleTokenDefaults(request.role) },
  };
  const source = foundry.utils.mergeObject(base, sourceAtRoot(valueRootForActorType(type), missingSystemData(layout, {})), { inplace: false }) as Record<string, unknown>;
  if (request.img) source.img = request.img;
  if (request.ownerId) source.ownership = { default: 0, [request.ownerId]: OWNER_LEVEL };
  return source;
}

/** Creates the actor (or a numbered batch, e.g. "Goblin 1..5"), links it to its player and files it in the GM's categories. */
export async function createActorsFromRequest(request: ActorCreationRequest): Promise<any[]> {
  const created: any[] = await CONFIG.Actor.documentClass.createDocuments(numberedNames(request.name, request.quantity).map((name) => actorSource(request, name)));
  const createdIds = created.map((actor) => actor.id);
  for (const categoryId of request.categoryIds) await addActorsToCategory(categoryId, createdIds);
  const owner = request.ownerId ? game.users.get(request.ownerId) : null;
  if (owner && !owner.character && created[0]) await owner.update({ character: created[0].id });
  if (!request.ownerId && !game.user.isGM && !game.user.character && created[0]) await game.user.update({ character: created[0].id });
  return created;
}
