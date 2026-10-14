import { followerDestinations, readTokenGroup, TOKEN_GROUP_FLAG, type GroupedToken, type Point } from "./tokenGroupRules";
import { SKIP_HISTORY } from "./canvasHistory";

interface MenuEntry {
  label: string;
  icon: string;
  onSelect: () => unknown;
}

/** Last known position of every token, so a move's shift can be measured once it arrives from the server. */
const knownPositions = new Map<string, Point>();

function groupOf(tokenDocument: any): string | null {
  return readTokenGroup(tokenDocument?._source?.flags?.world?.[TOKEN_GROUP_FLAG]);
}

function asGrouped(tokenDocument: any, position: Point = { x: Number(tokenDocument.x), y: Number(tokenDocument.y) }): GroupedToken {
  return { id: tokenDocument.id, x: position.x, y: position.y, group: groupOf(tokenDocument) };
}

function remember(tokenDocument: any): void {
  knownPositions.set(tokenDocument.id, { x: Number(tokenDocument.x), y: Number(tokenDocument.y) });
}

/** One GM client moves the followers, so two open GM windows never move them twice. */
function isFollowingClient(): boolean {
  return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

/** A follower that would walk through a wall on the viewed map stays where it is. */
function blockedByWall(scene: any, from: Point, to: Point, tokenDocument: any): boolean {
  if (scene.id !== canvas.scene?.id) return false;
  const half = { x: (Number(tokenDocument.width) || 1) * (Number(scene.grid?.size) || 100) / 2, y: (Number(tokenDocument.height) || 1) * (Number(scene.grid?.size) || 100) / 2 };
  const backend = CONFIG.Canvas?.polygonBackends?.move;
  return Boolean(backend?.testCollision?.({ x: from.x + half.x, y: from.y + half.y }, { x: to.x + half.x, y: to.y + half.y }, { type: "move", mode: "any" }));
}

async function moveFollowers(tokenDocument: any): Promise<void> {
  const before = knownPositions.get(tokenDocument.id);
  remember(tokenDocument);
  if (!before || !isFollowingClient() || !groupOf(tokenDocument)) return;
  const scene = tokenDocument.parent;
  const delta = { x: Number(tokenDocument.x) - before.x, y: Number(tokenDocument.y) - before.y };
  const members: any[] = scene.tokens.contents;
  const tokens = members.map((member) => asGrouped(member, knownPositions.get(member.id) ?? { x: Number(member.x), y: Number(member.y) }));
  const updates = followerDestinations(asGrouped(tokenDocument), delta, tokens).filter((update) => {
    const member = scene.tokens.get(update._id);
    const from = knownPositions.get(update._id) ?? { x: Number(member.x), y: Number(member.y) };
    return !blockedByWall(scene, from, update, member);
  });
  if (updates.length === 0) return;
  for (const update of updates) knownPositions.set(update._id, { x: update.x, y: update.y });
  await scene.updateEmbeddedDocuments("Token", updates, SKIP_HISTORY);
}

async function setGroup(tokenDocuments: any[], group: string | null): Promise<void> {
  const scene = tokenDocuments[0]?.parent;
  if (!scene) return;
  const key = group ? `flags.world.${TOKEN_GROUP_FLAG}` : `flags.world.-=${TOKEN_GROUP_FLAG}`;
  await scene.updateEmbeddedDocuments("Token", tokenDocuments.map((tokenDocument) => ({ _id: tokenDocument.id, [key]: group })));
}

function groupMenuEntries(token: any): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const selected: any[] = (canvas.tokens?.controlled ?? []).map((placeable: any) => placeable.document);
  const group = groupOf(token.document);
  if (selected.length >= 2 && selected.some((tokenDocument) => tokenDocument.id === token.id)) {
    entries.push({ label: `Agrupar os ${selected.length} selecionados (andam juntos)`, icon: "fa-solid fa-link", onSelect: () => setGroup(selected, group ?? foundry.utils.randomID()) });
  }
  if (group) {
    const size = token.document.parent.tokens.contents.filter((member: any) => groupOf(member) === group).length;
    entries.push({ label: `Tirar do grupo (${size} juntos)`, icon: "fa-solid fa-link-slash", onSelect: () => setGroup([token.document], null) });
  }
  return entries;
}

/** Tokens in the same group move together: when one moves, the others take the same step and keep their spacing. */
export function installTokenGroups(): void {
  const rememberAll = () => {
    for (const scene of game.scenes.contents) for (const tokenDocument of scene.tokens.contents) remember(tokenDocument);
  };
  Hooks.once("ready", rememberAll);
  Hooks.on("canvasReady", rememberAll);
  Hooks.on("createToken", (tokenDocument: any) => remember(tokenDocument));
  Hooks.on("deleteToken", (tokenDocument: any) => knownPositions.delete(tokenDocument.id));
  Hooks.on("updateToken", (tokenDocument: any, changes: Record<string, unknown>) => {
    if (!("x" in changes) && !("y" in changes)) return;
    void moveFollowers(tokenDocument).catch(() => ui.notifications.warn("Não foi possível mover o grupo junto."));
  });
  Hooks.on("getTokenMenuEntries", (token: any, entries: MenuEntry[]) => {
    if (game.user.isGM) entries.push(...groupMenuEntries(token));
  });
}
