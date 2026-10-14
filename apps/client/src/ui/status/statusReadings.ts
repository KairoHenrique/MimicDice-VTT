import type { StatusPanelState, StatusResource } from "@tabbletop/protocol";
import { LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE, isPlayerCharacter } from "../actors/actorRoles";
import { viewedCombat } from "../combat/combatActions";
import { allComponents, readLayout } from "../sheets/layout/sheetLayoutRules";
import { SheetValueStore } from "../sheets/layout/sheetValueRoot";
import { readResource } from "../sheets/layout/valueComponentViews";
import { matchResourceComponents } from "./statusResourceMatching";

const MAX_LISTED_ACTORS = 40;

export interface ResourceReading {
  resource: StatusResource;
  label: string;
  value: number;
  max: number;
  min: number;
  path: string;
}

/** Current, maximum and minimum of each enabled resource the actor's sheet has, in the GM's order. */
export function readActorResources(actor: any, resources: readonly StatusResource[]): ResourceReading[] {
  const layout = readLayout(actor.getFlag?.(MIMICDICE_FLAG_SCOPE, LAYOUT_FLAG_KEY));
  if (!layout) return [];
  const matches = matchResourceComponents(allComponents(layout), resources);
  const store = new SheetValueStore(actor);
  const readings: ResourceReading[] = [];
  for (const resource of resources) {
    const component = matches.get(resource.id);
    if (!component?.key) continue;
    const { value, max } = readResource(store.read(component.key));
    readings.push({ resource, label: resource.label, value, max, min: typeof component.min === "number" ? component.min : 0, path: store.pathOf(component.key) });
  }
  return readings;
}

function uniqueActors(candidates: Iterable<any>): any[] {
  const seen = new Set<string>();
  const actors: any[] = [];
  for (const actor of candidates) {
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    actors.push(actor);
    if (actors.length >= MAX_LISTED_ACTORS) break;
  }
  return actors;
}

function combatActors(): any[] {
  const combat = viewedCombat();
  return (combat?.turns ?? []).map((combatant: any) => combatant.actor);
}

function sceneActors(): any[] {
  return (canvas.ready ? (canvas.scene?.tokens?.contents ?? []) : []).map((token: any) => token.actor);
}

/** GM: the list chosen in the panel. Players: only the characters they control (their own and any the GM granted). */
export function actorsForPanel(state: StatusPanelState): any[] {
  const all: any[] = game.actors?.contents ?? [];
  if (!game.user.isGM) return uniqueActors(all.filter((actor) => actor.isOwner));
  switch (state.mode) {
    case "combat":
      return uniqueActors(combatActors());
    case "scene":
      return uniqueActors(sceneActors());
    case "custom":
      return uniqueActors(state.actorIds.map((id) => game.actors.get(id)));
    default:
      return uniqueActors(all.filter((actor) => isPlayerCharacter(actor)));
  }
}
