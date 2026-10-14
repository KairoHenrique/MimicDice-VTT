import type { Server, Socket } from "socket.io";
import {
  CHEST_FLAG,
  chestCapacity,
  chestPutRequestSchema,
  chestTakeRequestSchema,
  isChestFull,
  movableItemData,
  newChestEntry,
  readChest,
  scenePerceptionScores,
  SOCKET_EVENTS,
  visibleChestEntries,
  type Chest,
  type ChestPutRequest,
  type ChestTakeRequest,
} from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { ServerContext } from "../ServerContext";
import type { ActiveWorld } from "../world/ActiveWorld";
import { broadcastToEveryViewer } from "./documentHandlers";
import { assertActorNearTile, assertTableOpen, findScene, SERVER_GAME_MASTER } from "./lootPickupHandler";
import type { PresenceTracker } from "./PresenceTracker";
import { SocketRateLimiter } from "./SocketRateLimiter";

const CHEST_BURST = 5;
const CHEST_PER_SECOND = 2;

type Acknowledge = (response: { ok: true; name: string } | { error: string }) => void;
type Source = Record<string, any>;
interface Requester {
  userId: string;
  role: number;
}

function chestTile(scene: Source, tileId: string): { tile: Source; chest: Chest } {
  const tile = (scene.tiles as Source[] | undefined)?.find((candidate) => candidate._id === tileId);
  const chest = readChest(tile?.flags?.core);
  if (!tile || !chest || tile.hidden === true) throw HttpError.notFound("Esse baú não está mais no mapa");
  return { tile, chest };
}

function perceptionOf(scene: Source, actorId: string): number | null {
  return scenePerceptionScores(scene.flags?.world)[actorId] ?? null;
}

/**
 * Players take items out of a chest and store items in it. The server checks what the GM set: the chest must be next
 * to the character, and an item with a perception DC can only be taken by a character whose perception reaches it.
 */
export function attachChestHandler(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker, userId: string): void {
  const rateLimiter = new SocketRateLimiter(CHEST_BURST, CHEST_PER_SECOND);
  let queue: Promise<unknown> = Promise.resolve();

  async function saveChest(world: ActiveWorld, sceneId: string, tileId: string, chest: Chest): Promise<void> {
    const outcome = await world.documents.modify({ type: "Tile", action: "update", operation: { parentUuid: `Scene.${sceneId}`, updates: [{ _id: tileId, [`flags.core.${CHEST_FLAG}`]: chest }] } }, SERVER_GAME_MASTER);
    broadcastToEveryViewer(io, presence, world, outcome);
  }

  function assertCanReach(world: ActiveWorld, scene: Source, tile: Source, actorId: string): void {
    assertTableOpen(world, userId);
    if (!world.users.isGameMaster(userId)) assertActorNearTile(scene, tile._id, actorId, "Chegue mais perto do baú");
  }

  async function take(world: ActiveWorld, request: ChestTakeRequest, requester: Requester): Promise<string> {
    const scene = findScene(world, request.sceneId);
    const { tile, chest } = chestTile(scene, request.tileId);
    assertCanReach(world, scene, tile, request.actorId);
    const noticed = world.users.isGameMaster(userId) ? chest.entries : visibleChestEntries(tile, perceptionOf(scene, request.actorId));
    const entry = noticed.find((candidate) => candidate.id === request.entryId);
    if (!entry) throw HttpError.notFound("Esse item não está no baú");
    const created = await world.documents.modify({ type: "Item", action: "create", operation: { parentUuid: `Actor.${request.actorId}`, data: [{ ...entry.item }] } }, requester);
    broadcastToEveryViewer(io, presence, world, created);
    await saveChest(world, request.sceneId, request.tileId, { ...chest, entries: chest.entries.filter((candidate) => candidate.id !== entry.id) });
    return entry.item.name;
  }

  async function put(world: ActiveWorld, request: ChestPutRequest, requester: Requester): Promise<string> {
    const scene = findScene(world, request.sceneId);
    const { tile, chest } = chestTile(scene, request.tileId);
    assertCanReach(world, scene, tile, request.actorId);
    if (isChestFull(chest)) throw HttpError.badRequest(`O baú está cheio (cabem ${chestCapacity(chest)} itens)`);
    const actor = world.documents.listCollection("actors").find((candidate) => candidate._id === request.actorId);
    const item = movableItemData(((actor?.items as Source[] | undefined) ?? []).find((candidate) => candidate._id === request.itemId) ?? {});
    if (!item) throw HttpError.notFound("Esse item não está mais no inventário");
    const removed = await world.documents.modify({ type: "Item", action: "delete", operation: { parentUuid: `Actor.${request.actorId}`, ids: [request.itemId] } }, requester);
    broadcastToEveryViewer(io, presence, world, removed);
    try {
      await saveChest(world, request.sceneId, request.tileId, { ...chest, entries: [...chest.entries, newChestEntry(chest.entries, item)] });
    } catch (error) {
      const restored = await world.documents.modify({ type: "Item", action: "create", operation: { parentUuid: `Actor.${request.actorId}`, data: [{ ...item }] } }, SERVER_GAME_MASTER);
      broadcastToEveryViewer(io, presence, world, restored);
      throw error;
    }
    return item.name;
  }

  function listen<T>(event: string, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, run: (world: ActiveWorld, request: T, requester: Requester) => Promise<string>): void {
    socket.on(event, (payload: unknown, acknowledgeCandidate: unknown) => {
      const acknowledge: Acknowledge = typeof acknowledgeCandidate === "function" ? (acknowledgeCandidate as Acknowledge) : () => undefined;
      const world = context.activeWorld.current;
      const parsed = schema.safeParse(payload);
      const user = world?.users.getUser(userId);
      if (!world || !user || !parsed.success) return acknowledge({ error: "Dados inválidos" });
      if (!rateLimiter.tryConsume()) return acknowledge({ error: "Aguarde um instante" });
      const attempt = queue.then(() => run(world, parsed.data, { userId, role: user.role }));
      queue = attempt.catch(() => undefined);
      attempt
        .then((name) => acknowledge({ ok: true, name }))
        .catch((error: unknown) => {
          if (error instanceof HttpError) return acknowledge({ error: error.publicMessage });
          context.logger.error("Falha ao usar baú", error);
          acknowledge({ error: "Erro interno do servidor" });
        });
    });
  }

  listen(SOCKET_EVENTS.CHEST_TAKE, chestTakeRequestSchema, take);
  listen(SOCKET_EVENTS.CHEST_PUT, chestPutRequestSchema, put);
}
