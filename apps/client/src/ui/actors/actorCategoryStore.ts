import { actorCategoriesSchema, MAX_ACTOR_CATEGORIES, type ActorCategory } from "@tabbletop/protocol";
import { newLocalId } from "../sheets/layout/sheetLayoutRules";
import { MIMICDICE_SETTINGS_NAMESPACE } from "../sheets/layout/sheetTemplateStore";

/** Stored per user: the server only ever sends a user-scoped setting to its owner, so players never see the GM's categories. */
export const ACTOR_CATEGORIES_SETTING = "actorCategories";

export const CATEGORY_COLORS = ["#d97a2b", "#c0392b", "#2f80d1", "#27ae60", "#8e44ad", "#16a085", "#e0b84c", "#7f8c8d"] as const;

export function readActorCategories(): ActorCategory[] {
  const parsed = actorCategoriesSchema.safeParse(game.settings.get(MIMICDICE_SETTINGS_NAMESPACE, ACTOR_CATEGORIES_SETTING));
  return parsed.success ? parsed.data.categories : [];
}

async function writeActorCategories(categories: ActorCategory[]): Promise<void> {
  await game.settings.set(MIMICDICE_SETTINGS_NAMESPACE, ACTOR_CATEGORIES_SETTING, actorCategoriesSchema.parse({ categories }));
}

export async function createActorCategory(name: string, color: string): Promise<ActorCategory> {
  const categories = readActorCategories();
  if (categories.length >= MAX_ACTOR_CATEGORIES) throw new Error(`Limite de ${MAX_ACTOR_CATEGORIES} categorias.`);
  const category: ActorCategory = { id: newLocalId(), name: name.trim(), color, actorIds: [] };
  await writeActorCategories([...categories, category]);
  return category;
}

export async function updateActorCategory(categoryId: string, changes: Partial<Pick<ActorCategory, "name" | "color">>): Promise<void> {
  await writeActorCategories(readActorCategories().map((category) => (category.id === categoryId ? { ...category, ...changes } : category)));
}

export async function deleteActorCategory(categoryId: string): Promise<void> {
  await writeActorCategories(readActorCategories().filter((category) => category.id !== categoryId));
}

/** Sets which categories an actor belongs to and drops ids of actors that were deleted meanwhile. */
export async function setActorMembership(actorIds: readonly string[], memberOf: ReadonlySet<string>): Promise<void> {
  const existing = new Set<string>(game.actors.contents.map((actor: any) => actor.id));
  const categories = readActorCategories().map((category) => {
    const members = new Set(category.actorIds.filter((actorId) => existing.has(actorId)));
    for (const actorId of actorIds) {
      if (memberOf.has(category.id)) members.add(actorId);
      else members.delete(actorId);
    }
    return { ...category, actorIds: Array.from(members) };
  });
  await writeActorCategories(categories);
}

export async function addActorsToCategory(categoryId: string, actorIds: readonly string[]): Promise<void> {
  await writeActorCategories(
    readActorCategories().map((category) => (category.id === categoryId ? { ...category, actorIds: Array.from(new Set([...category.actorIds, ...actorIds])) } : category)),
  );
}

export function categoriesOfActor(actorId: string): ActorCategory[] {
  return readActorCategories().filter((category) => category.actorIds.includes(actorId));
}
