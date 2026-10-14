import type { Server, Socket } from "socket.io";
import { LOOT_FLAG, LOOT_REACH_SQUARES, lootItemSchema, lootPickupRequestSchema, SOCKET_EVENTS, TABLE_SESSION_OPEN_SETTING_KEY, USER_ROLES, type LootItem, type LootPickupRequest } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { ServerContext } from "../ServerContext";
import type { ActiveWorld } from "../world/ActiveWorld";
import { broadcastToEveryViewer } from "./documentHandlers";
import type { PresenceTracker } from "./PresenceTracker";
import { SocketRateLimiter } from "./SocketRateLimiter";

const PICKUPS_BURST = 5;
const PICKUPS_PER_SECOND = 2;
const DEFAULT_GRID_SIZE = 100;
const SERVER_GAME_MASTER = { userId: "server", role: USER_ROLES.GAMEMASTER };

type Acknowledge = (response: { ok: true; name: string } | { error: string }) => void;
type SceneSource = Record<string, any>;

function findScene(world: ActiveWorld, sceneId: string): SceneSource {
  const scene = world.documents.listCollection("scenes").find((candidate) => candidate._id === sceneId);
  if (!scene) throw HttpError.notFound("Cena não encontrada");
  return scene;
}

function readLoot(scene: SceneSource, tileId: string): LootItem {
  const tile = (scene.tiles as SceneSource[] | undefined)?.find((candidate) => candidate._id === tileId);
  const parsed = lootItemSchema.safeParse(tile?.flags?.core?.[LOOT_FLAG]);
  if (!tile || tile.hidden === true || !parsed.success) throw HttpError.notFound("Esse item não está mais no mapa");
  return parsed.data;
}

/** Distance from the token's center to the closest edge of the item, in pixels. */
function reachDistance(token: SceneSource, tile: SceneSource, gridSize: number): number {
  const centerX = Number(token.x) + (Number(token.width) || 1) * gridSize * 0.5;
  const centerY = Number(token.y) + (Number(token.height) || 1) * gridSize * 0.5;
  const left = Number(tile.x);
  const top = Number(tile.y);
  const closestX = Math.min(Math.max(centerX, left), left + Number(tile.width));
  const closestY = Math.min(Math.max(centerY, top), top + Number(tile.height));
  return Math.hypot(centerX - closestX, centerY - closestY);
}

function assertWithinReach(scene: SceneSource, request: LootPickupRequest): void {
  const gridSize = Number(scene.grid?.size) || DEFAULT_GRID_SIZE;
  const tile = (scene.tiles as SceneSource[]).find((candidate) => candidate._id === request.tileId) as SceneSource;
  const tokens = ((scene.tokens as SceneSource[] | undefined) ?? []).filter((token) => token.actorId === request.actorId);
  if (!tokens.some((token) => reachDistance(token, tile, gridSize) <= LOOT_REACH_SQUARES * gridSize)) throw HttpError.badRequest("Chegue mais perto do item para pegar");
}

function assertTableOpen(world: ActiveWorld, userId: string): void {
  if (world.users.isGameMaster(userId)) return;
  if (world.settings.readWorldValue<boolean>(TABLE_SESSION_OPEN_SETTING_KEY) !== true) throw HttpError.forbidden("A sessão está fechada pelo mestre");
}

/**
 * A player picks up an item the GM dropped on the map: it goes into the inventory of a character they own whose token
 * stands next to it, and the item leaves the map. Pickups run one at a time, so two players never get the same item.
 */
export function attachLootPickupHandler(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker, userId: string): void {
  const rateLimiter = new SocketRateLimiter(PICKUPS_BURST, PICKUPS_PER_SECOND);
  let queue: Promise<unknown> = Promise.resolve();

  async function pickUp(world: ActiveWorld, request: LootPickupRequest, role: number): Promise<string> {
    assertTableOpen(world, userId);
    const scene = findScene(world, request.sceneId);
    const loot = readLoot(scene, request.tileId);
    if (!world.users.isGameMaster(userId)) assertWithinReach(scene, request);
    const created = await world.documents.modify({ type: "Item", action: "create", operation: { parentUuid: `Actor.${request.actorId}`, data: [{ ...loot }] } }, { userId, role });
    broadcastToEveryViewer(io, presence, world, created);
    const removed = await world.documents.modify({ type: "Tile", action: "delete", operation: { parentUuid: `Scene.${request.sceneId}`, ids: [request.tileId] } }, SERVER_GAME_MASTER);
    broadcastToEveryViewer(io, presence, world, removed);
    return loot.name;
  }

  socket.on(SOCKET_EVENTS.LOOT_PICKUP, (payload: unknown, acknowledgeCandidate: unknown) => {
    const acknowledge: Acknowledge = typeof acknowledgeCandidate === "function" ? (acknowledgeCandidate as Acknowledge) : () => undefined;
    const world = context.activeWorld.current;
    const parsed = lootPickupRequestSchema.safeParse(payload);
    const user = world?.users.getUser(userId);
    if (!world || !user || !parsed.success) return acknowledge({ error: "Dados inválidos" });
    if (!rateLimiter.tryConsume()) return acknowledge({ error: "Aguarde um instante" });
    const attempt = queue.then(() => pickUp(world, parsed.data, user.role));
    queue = attempt.catch(() => undefined);
    attempt
      .then((name) => acknowledge({ ok: true, name }))
      .catch((error: unknown) => {
        if (error instanceof HttpError) return acknowledge({ error: error.publicMessage });
        context.logger.error("Falha ao pegar item do mapa", error);
        acknowledge({ error: "Erro interno do servidor" });
      });
  });
}
