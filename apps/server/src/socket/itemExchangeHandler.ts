import type { Server, Socket } from "socket.io";
import { itemTransferRequestSchema, LOOT_FLAG, LOOT_REACH_SQUARES, lootDropRequestSchema, movableItemData, SOCKET_EVENTS, type ItemTransferRequest, type LootDropRequest, type LootItem } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import type { ServerContext } from "../ServerContext";
import type { ActiveWorld } from "../world/ActiveWorld";
import { broadcastToEveryViewer } from "./documentHandlers";
import { assertTableOpen, DEFAULT_GRID_SIZE, findScene, SERVER_GAME_MASTER } from "./lootPickupHandler";
import type { PresenceTracker } from "./PresenceTracker";
import { SocketRateLimiter } from "./SocketRateLimiter";

const EXCHANGES_BURST = 5;
const EXCHANGES_PER_SECOND = 2;

type Acknowledge = (response: { ok: true; name: string } | { error: string }) => void;
type Source = Record<string, any>;
interface Requester {
  userId: string;
  role: number;
}

function inventoryItem(world: ActiveWorld, actorId: string, itemId: string): LootItem {
  const actor = world.documents.listCollection("actors").find((candidate) => candidate._id === actorId);
  const item = (actor?.items as Source[] | undefined)?.find((candidate) => candidate._id === itemId);
  const data = item ? movableItemData(item) : null;
  if (!data) throw HttpError.notFound("Esse item não está mais no inventário");
  return data;
}

function tokenCenter(token: Source, gridSize: number): { x: number; y: number } {
  return { x: Number(token.x) + (Number(token.width) || 1) * gridSize * 0.5, y: Number(token.y) + (Number(token.height) || 1) * gridSize * 0.5 };
}

function assertDropWithinReach(scene: Source, request: LootDropRequest): void {
  const gridSize = Number(scene.grid?.size) || DEFAULT_GRID_SIZE;
  const tokens = ((scene.tokens as Source[] | undefined) ?? []).filter((token) => token.actorId === request.actorId);
  const reach = (LOOT_REACH_SQUARES + 0.5) * gridSize;
  const near = tokens.some((token) => {
    const center = tokenCenter(token, gridSize);
    return Math.hypot(center.x - request.x, center.y - request.y) <= reach;
  });
  if (!near) throw HttpError.badRequest("Solte o item perto do seu personagem");
}

function assertTargetOnScene(scene: Source, actorId: string): void {
  const tokens = (scene.tokens as Source[] | undefined) ?? [];
  if (!tokens.some((token) => token.actorId === actorId && token.hidden !== true)) throw HttpError.badRequest("Esse personagem não está no mapa");
}

function lootTileData(scene: Source, item: LootItem, x: number, y: number): Source {
  const size = Number(scene.grid?.size) || DEFAULT_GRID_SIZE;
  const cornerX = Math.floor(x / size) * size;
  const cornerY = Math.floor(y / size) * size;
  return { x: cornerX, y: cornerY, width: size, height: size, texture: { src: item.img || "icons/svg/item-bag.svg" }, flags: { core: { [LOOT_FLAG]: item } } };
}

/**
 * Players move items they carry: onto the map next to their token, or into another character's inventory. The item
 * leaves the inventory as the player (so ownership is checked), and only then the server places it; a failure puts it back.
 */
export function attachItemExchangeHandler(context: ServerContext, io: Server, socket: Socket, presence: PresenceTracker, userId: string): void {
  const rateLimiter = new SocketRateLimiter(EXCHANGES_BURST, EXCHANGES_PER_SECOND);
  let queue: Promise<unknown> = Promise.resolve();

  async function removeFromInventory(world: ActiveWorld, actorId: string, itemId: string, requester: Requester): Promise<void> {
    const removed = await world.documents.modify({ type: "Item", action: "delete", operation: { parentUuid: `Actor.${actorId}`, ids: [itemId] } }, requester);
    broadcastToEveryViewer(io, presence, world, removed);
  }

  async function placeOrRestore(world: ActiveWorld, place: () => Promise<unknown>, actorId: string, item: LootItem): Promise<void> {
    try {
      broadcastToEveryViewer(io, presence, world, (await place()) as never);
    } catch (error) {
      const restored = await world.documents.modify({ type: "Item", action: "create", operation: { parentUuid: `Actor.${actorId}`, data: [{ ...item }] } }, SERVER_GAME_MASTER);
      broadcastToEveryViewer(io, presence, world, restored);
      throw error;
    }
  }

  async function dropOnMap(world: ActiveWorld, request: LootDropRequest, requester: Requester): Promise<string> {
    assertTableOpen(world, userId);
    const scene = findScene(world, request.sceneId);
    const item = inventoryItem(world, request.actorId, request.itemId);
    if (!world.users.isGameMaster(userId)) assertDropWithinReach(scene, request);
    await removeFromInventory(world, request.actorId, request.itemId, requester);
    await placeOrRestore(world, () => world.documents.modify({ type: "Tile", action: "create", operation: { parentUuid: `Scene.${request.sceneId}`, data: [lootTileData(scene, item, request.x, request.y)] } }, SERVER_GAME_MASTER), request.actorId, item);
    return item.name;
  }

  async function transfer(world: ActiveWorld, request: ItemTransferRequest, requester: Requester): Promise<string> {
    assertTableOpen(world, userId);
    if (request.fromActorId === request.toActorId) throw HttpError.badRequest("O item já está com esse personagem");
    const scene = findScene(world, request.sceneId);
    if (!world.users.isGameMaster(userId)) assertTargetOnScene(scene, request.toActorId);
    const item = inventoryItem(world, request.fromActorId, request.itemId);
    await removeFromInventory(world, request.fromActorId, request.itemId, requester);
    await placeOrRestore(world, () => world.documents.modify({ type: "Item", action: "create", operation: { parentUuid: `Actor.${request.toActorId}`, data: [{ ...item }] } }, SERVER_GAME_MASTER), request.fromActorId, item);
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
          context.logger.error("Falha ao mover item", error);
          acknowledge({ error: "Erro interno do servidor" });
        });
    });
  }

  listen(SOCKET_EVENTS.LOOT_DROP, lootDropRequestSchema, dropOnMap);
  listen(SOCKET_EVENTS.ITEM_TRANSFER, itemTransferRequestSchema, transfer);
}
