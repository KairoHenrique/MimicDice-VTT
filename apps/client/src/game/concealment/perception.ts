import { isConcealedFrom, PERCEPTION_SCORES_FLAG, perceptionScoresUpdate, readConcealment, REVEALED_FLAG, scenePerceptionScores, type PerceptionScores } from "@tabbletop/protocol";

function refreshConcealedObjects(): void {
  if (!canvas?.ready) return;
  for (const layer of [canvas.tiles, canvas.notes]) for (const placeable of layer?.placeables ?? []) placeable.refresh();
  canvas.perception?.update?.();
}

/** Scores of the scene on screen; a scene where the GM wrote nothing down starts empty. */
export function perceptionScores(): PerceptionScores {
  return scenePerceptionScores(canvas?.scene?._source?.flags?.world);
}

export async function savePerceptionScores(scores: PerceptionScores): Promise<unknown> {
  const scene = canvas?.scene;
  if (!scene) return undefined;
  const update = perceptionScoresUpdate(perceptionScores(), scores);
  return Object.keys(update).length ? scene.update(update) : undefined;
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

/** GM: shows a hidden tile or note (or an armed trap) to everyone, or hides it again behind its DC. */
export function toggleRevealed(document: any): Promise<unknown> {
  const revealed = readConcealment(document?._source?.flags?.world).revealed;
  return document.update(revealed ? { [`flags.world.-=${REVEALED_FLAG}`]: null } : { [`flags.world.${REVEALED_FLAG}`]: true });
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
  Hooks.on("updateScene", (scene: any, changes: any) => {
    const scoresChanged = Object.keys(changes?.flags?.world ?? {}).some((key) => key.replace(/^-=/, "") === PERCEPTION_SCORES_FLAG);
    if (scoresChanged && scene.id === canvas?.scene?.id) refreshConcealedObjects();
  });
}
