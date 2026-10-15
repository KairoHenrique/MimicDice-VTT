import {
  hasPerceptionSecret,
  improvesPerception,
  isConcealedFrom,
  noticesChestEntry,
  PERCEIVED_BY_FLAG,
  perceptionOfCharacters,
  perceptionScoresUpdate,
  readChest,
  readConcealment,
  REVEALED_FLAG,
  scenePerceptionScores,
  type Concealment,
  type PerceptionScores,
} from "@tabbletop/protocol";

const AREA_PROBE_FRACTIONS = [0.5, 0.15, 0.85] as const;

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SightShape {
  contains(x: number, y: number): boolean;
}

interface PerceptionTarget {
  document: any;
  area: Area;
  concealment: Concealment;
}

export interface PerceptionFinding {
  actorName: string;
  hasToken: boolean;
  inSight: number;
  found: number;
}

function refreshConcealedObjects(): void {
  if (!canvas?.ready) return;
  for (const layer of [canvas.tiles, canvas.notes]) for (const placeable of layer?.placeables ?? []) placeable.refresh();
  canvas.perception?.update?.();
}

/** Last rolls written down on the scene on screen, kept as a reminder for the GM. */
export function perceptionScores(): PerceptionScores {
  return scenePerceptionScores(canvas?.scene?._source?.flags?.world);
}

async function rememberLastRolls(rolls: PerceptionScores): Promise<void> {
  const scene = canvas?.scene;
  if (!scene) return;
  const update = perceptionScoresUpdate(perceptionScores(), { ...perceptionScores(), ...rolls });
  if (Object.keys(update).length) await scene.update(update);
}

/**
 * Characters whose rolls decide what the current user sees: the puppet the GM looks through, or the player's own
 * characters. Null for the GM looking freely, who sees every secret (faded).
 */
function viewerActorIds(): string[] | null {
  const puppet = canvas?.tokens?.puppet;
  if (puppet) return puppet.document?.actorId ? [puppet.document.actorId] : [];
  if (game.user.isGM) return null;
  return (game.actors?.contents ?? []).filter((actor: any) => actor.isOwner).map((actor: any) => actor.id);
}

/** Best roll the current user's characters made with this object in sight; null when none of them did. */
export function viewerPerceptionOf(document: any): number | null {
  const actorIds = viewerActorIds();
  return actorIds === null ? null : perceptionOfCharacters(readConcealment(document?._source?.flags?.world), actorIds);
}

/** Roll a character made while this chest (or object) was in its sight. */
export function characterPerceptionOf(document: any, actorId: string): number | null {
  return perceptionOfCharacters(readConcealment(document?._source?.flags?.world), [actorId]);
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

function hasHiddenChestItems(tileDocument: any): boolean {
  return readChest(tileDocument._source?.flags?.core)?.entries.some((entry) => !noticesChestEntry(entry, null)) === true;
}

function noteArea(noteDocument: any): Area {
  const size = Number(noteDocument.iconSize) || 40;
  return { x: Number(noteDocument.x) - size / 2, y: Number(noteDocument.y) - size / 2, width: size, height: size };
}

/** Tiles and notes on the scene that a perception roll can uncover. */
function perceptionTargets(scene: any): PerceptionTarget[] {
  const targets: PerceptionTarget[] = [];
  for (const tileDocument of scene.tiles?.contents ?? []) {
    const concealment = readConcealment(tileDocument._source?.flags?.world);
    if (tileDocument.hidden || !hasPerceptionSecret(concealment, hasHiddenChestItems(tileDocument))) continue;
    targets.push({ document: tileDocument, concealment, area: { x: Number(tileDocument.x), y: Number(tileDocument.y), width: Number(tileDocument.width), height: Number(tileDocument.height) } });
  }
  for (const noteDocument of scene.notes?.contents ?? []) {
    const concealment = readConcealment(noteDocument._source?.flags?.world);
    if (hasPerceptionSecret(concealment)) targets.push({ document: noteDocument, concealment, area: noteArea(noteDocument) });
  }
  return targets;
}

function seesArea(sight: SightShape, area: Area): boolean {
  return AREA_PROBE_FRACTIONS.some((fractionY) => AREA_PROBE_FRACTIONS.some((fractionX) => sight.contains(area.x + area.width * fractionX, area.y + area.height * fractionY)));
}

function findsSomething(target: PerceptionTarget, score: number): boolean {
  if (!isConcealedFrom(target.concealment, score) && (target.concealment.perceptionDc !== null || target.concealment.trap !== null)) return true;
  return readChest(target.document._source?.flags?.core)?.entries.some((entry) => !noticesChestEntry(entry, null) && noticesChestEntry(entry, score)) === true;
}

function sightsOf(actorId: string): SightShape[] {
  const tokens: any[] = (canvas.tokens?.placeables ?? []).filter((token: any) => token.document?.actorId === actorId && !token.document?.hidden);
  return tokens.map((token) => canvas.visibility.lineOfSightOf(token));
}

/** Records one character's roll on every target in its sight; returns what it saw and found. */
function recordRoll(actor: any, score: number, targets: PerceptionTarget[], updates: Map<any, Record<string, unknown>>): PerceptionFinding {
  const sights = sightsOf(actor.id);
  const finding: PerceptionFinding = { actorName: String(actor.name), hasToken: sights.length > 0, inSight: 0, found: 0 };
  for (const target of targets) {
    if (!sights.some((sight) => seesArea(sight, target.area))) continue;
    finding.inSight += 1;
    if (findsSomething(target, score)) finding.found += 1;
    if (!improvesPerception(target.concealment, actor.id, score)) continue;
    const update: Record<string, unknown> = updates.get(target.document) ?? { _id: target.document.id };
    update[`flags.world.${PERCEIVED_BY_FLAG}.${actor.id}`] = score;
    updates.set(target.document, update);
  }
  return finding;
}

async function saveRecordedRolls(scene: any, updates: Map<any, Record<string, unknown>>): Promise<void> {
  const byType = (documentName: string) => [...updates].filter(([document]) => document.documentName === documentName).map(([, update]) => update);
  const tiles = byType("Tile");
  const notes = byType("Note");
  if (tiles.length) await scene.updateEmbeddedDocuments("Tile", tiles);
  if (notes.length) await scene.updateEmbeddedDocuments("Note", notes);
}

/**
 * GM: applies new perception rolls. Each roll only counts for the objects its character's tokens see right now, so
 * the rest of the map stays hidden until they roll again with it in sight. A lower roll never hides what was found.
 */
export async function applyPerceptionRolls(rolls: PerceptionScores): Promise<PerceptionFinding[]> {
  const scene = canvas?.scene;
  if (!game.user.isGM || !scene || !canvas.ready) return [];
  const targets = perceptionTargets(scene);
  const updates = new Map<any, Record<string, unknown>>();
  const findings: PerceptionFinding[] = [];
  for (const [actorId, score] of Object.entries(rolls)) {
    const actor = game.actors?.get(actorId);
    if (actor) findings.push(recordRoll(actor, score, targets, updates));
  }
  await saveRecordedRolls(scene, updates);
  await rememberLastRolls(rolls);
  return findings;
}

/** Tiles and notes with a perception DC (or armed traps) are drawn only for characters that rolled high enough with them in sight. */
export function installConcealmentRules(): void {
  const rule = (document: any) => {
    const actorIds = viewerActorIds();
    const concealment = readConcealment(document?._source?.flags?.world);
    return isConcealedFrom(concealment, actorIds === null ? null : perceptionOfCharacters(concealment, actorIds));
  };
  if (CONFIG.Tile?.objectClass) CONFIG.Tile.objectClass.concealRule = rule;
  if (CONFIG.Note?.objectClass) CONFIG.Note.objectClass.concealRule = rule;
  Hooks.on("updateActor", (_actor: any, changes: Record<string, unknown>) => {
    if ("ownership" in changes) refreshConcealedObjects();
  });
}
