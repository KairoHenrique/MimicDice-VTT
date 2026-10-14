import type { ClientSettings } from "@tabbletop/api";
import { isConcealedFrom, PERCEPTION_SCORES_SETTING_KEY, parsePerceptionScores, perceptionScoresSchema, readConcealment, type PerceptionScores } from "@tabbletop/protocol";

const [SCORES_NAMESPACE, SCORES_KEY] = PERCEPTION_SCORES_SETTING_KEY.split(".") as [string, string];

function refreshConcealedObjects(): void {
  if (!canvas?.ready) return;
  for (const layer of [canvas.tiles, canvas.notes]) for (const placeable of layer?.placeables ?? []) placeable.refresh();
  canvas.perception?.update?.();
}

export function registerPerceptionSettings(settings: ClientSettings): void {
  settings.register(SCORES_NAMESPACE, SCORES_KEY, {
    name: "Percepção anotada pelo mestre",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => refreshConcealedObjects(),
  });
}

export function perceptionScores(): PerceptionScores {
  return parsePerceptionScores(game.settings.get(SCORES_NAMESPACE, SCORES_KEY));
}

export function savePerceptionScores(scores: PerceptionScores): Promise<unknown> {
  return game.settings.set(SCORES_NAMESPACE, SCORES_KEY, perceptionScoresSchema.parse(scores));
}

/** Best perception among the characters this player controls; null when the GM wrote none down. */
function ownPerception(): number | null {
  const scores = perceptionScores();
  let best: number | null = null;
  for (const actor of game.actors?.contents ?? []) {
    const score = scores[actor.id];
    if (score !== undefined && actor.isOwner && (best === null || score > best)) best = score;
  }
  return best;
}

/** Characters played by someone, for the GM's perception list. */
export function playerCharacters(): any[] {
  return (game.actors?.contents ?? []).filter((actor: any) => actor.hasPlayerOwner).sort((left: any, right: any) => String(left.name).localeCompare(String(right.name), "pt-BR"));
}

/** Tiles and notes with a perception DC (or armed traps) are drawn only for players whose character reaches it. */
export function installConcealmentRules(): void {
  const rule = (document: any) => !game.user.isGM && isConcealedFrom(readConcealment(document?._source?.flags?.world), ownPerception());
  if (CONFIG.Tile?.objectClass) CONFIG.Tile.objectClass.concealRule = rule;
  if (CONFIG.Note?.objectClass) CONFIG.Note.objectClass.concealRule = rule;
  Hooks.on("updateActor", (_actor: any, changes: Record<string, unknown>) => {
    if ("ownership" in changes) refreshConcealedObjects();
  });
}
