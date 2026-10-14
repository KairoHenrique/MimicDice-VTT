import { describe, expect, it } from "vitest";
import { MAX_PLAYERS_PER_WORLD, USER_ROLES } from "@tabbletop/protocol";
import type { PasswordHasher } from "../security/PasswordHasher";
import { UserService, type UserDocument } from "./UserService";
import type { DocumentCollectionStore } from "./WorldDatabase";

function memoryStore(): DocumentCollectionStore<UserDocument> {
  const documents = new Map<string, UserDocument>();
  return {
    get: async (id: string) => documents.get(id),
    getAll: async () => [...documents.values()],
    put: async (document: UserDocument) => void documents.set(document._id, document),
    delete: async (id: string) => void documents.delete(id),
  } as unknown as DocumentCollectionStore<UserDocument>;
}

const fakeHasher = { hashPassword: async (plain: string) => `hash:${plain.length}`, verifyPassword: async () => false, consumeEquivalentTime: async () => undefined } as unknown as PasswordHasher;

async function serviceWithMaster(): Promise<UserService> {
  const service = new UserService(memoryStore(), fakeHasher);
  await service.createUser({ name: "Mestre", password: "senha-forte-1", role: USER_ROLES.GAMEMASTER });
  return service;
}

describe("joinPlayerByName", () => {
  it("creates a player on first visit and returns the same account afterwards, ignoring case", async () => {
    const service = await serviceWithMaster();
    const first = await service.joinPlayerByName("Lyra");
    const again = await service.joinPlayerByName("  lyra ");
    expect(first.role).toBe(USER_ROLES.PLAYER);
    expect(again._id).toBe(first._id);
  });

  it("never lets a name reach a Game Master account", async () => {
    const service = await serviceWithMaster();
    await expect(service.joinPlayerByName("mestre")).rejects.toThrow(/mestre/);
  });

  it("does not create duplicates when the same name joins twice at once", async () => {
    const service = await serviceWithMaster();
    const [left, right] = await Promise.all([service.joinPlayerByName("Kael"), service.joinPlayerByName("Kael")]);
    expect(left._id).toBe(right._id);
    expect(service.listJoinableUsers().filter((user) => user.name === "Kael")).toHaveLength(1);
  });

  it("caps how many players a table can hold", async () => {
    const service = await serviceWithMaster();
    for (let index = 0; index < MAX_PLAYERS_PER_WORLD; index++) await service.joinPlayerByName(`Jogador ${index}`);
    await expect(service.joinPlayerByName("Mais um")).rejects.toThrow(/jogadores demais/);
  });
});

describe("roles", () => {
  it("collapses old trusted-player and assistant accounts into player and Game Master on load", async () => {
    const store = memoryStore();
    const base = { color: "#fff", avatar: null, character: null, flags: {}, passwordHash: "x" };
    await store.put({ ...base, _id: "TrustedPlayer001", name: "Confiável", role: USER_ROLES.TRUSTED });
    await store.put({ ...base, _id: "AssistantUser001", name: "Assistente", role: USER_ROLES.ASSISTANT });
    const service = new UserService(store, fakeHasher);
    await service.load();
    expect(service.getUser("TrustedPlayer001")?.role).toBe(USER_ROLES.PLAYER);
    expect(service.getUser("AssistantUser001")?.role).toBe(USER_ROLES.GAMEMASTER);
    expect((await store.get("TrustedPlayer001"))?.role).toBe(USER_ROLES.PLAYER);
  });

  it("promotes a player to Game Master with a new password and refuses to demote the last one", async () => {
    const service = await serviceWithMaster();
    const player = await service.joinPlayerByName("Lyra");
    const promoted = await service.changeRole(player._id, { role: USER_ROLES.GAMEMASTER, password: "nova-senha-1" });
    expect(promoted.role).toBe(USER_ROLES.GAMEMASTER);
    expect(service.getUser(player._id)?.passwordHash).toBe("hash:12");
    await service.changeRole(player._id, { role: USER_ROLES.PLAYER });
    const master = service.findByName("Mestre") as UserDocument;
    await expect(service.changeRole(master._id, { role: USER_ROLES.PLAYER })).rejects.toThrow(/pelo menos um mestre/);
  });

  it("shows returning players their character name but never a Game Master's", async () => {
    const service = await serviceWithMaster();
    const player = await service.joinPlayerByName("Bruno");
    await service.updateProfile(player._id, { character: "KaelActorId00001" });
    const names = (actorId: string) => (actorId === "KaelActorId00001" ? "Kael" : null);
    const listed = service.listJoinableUsers(names);
    expect(listed.find((user) => user.name === "Bruno")?.characterName).toBe("Kael");
    expect(listed.find((user) => user.name === "Mestre")?.characterName).toBeNull();
  });
});

describe("acceptsGameMasterPassword", () => {
  const checkingHasher = {
    hashPassword: async (plain: string) => `hash:${plain}`,
    verifyPassword: async (hash: string, plain: string) => hash === `hash:${plain}`,
    consumeEquivalentTime: async () => undefined,
  } as unknown as PasswordHasher;

  it("accepts only a Game Master's password, not a player's", async () => {
    const service = new UserService(memoryStore(), checkingHasher);
    await service.createUser({ name: "Mestre", password: "segredo", role: USER_ROLES.GAMEMASTER });
    await service.createUser({ name: "Lyra", password: "da-lyra", role: USER_ROLES.PLAYER });
    expect(await service.acceptsGameMasterPassword("segredo")).toBe(true);
    expect(await service.acceptsGameMasterPassword("da-lyra")).toBe(false);
    expect(await service.acceptsGameMasterPassword("")).toBe(false);
  });

  it("lets a room without a Game Master password, or not set up yet, through", async () => {
    const openRoom = new UserService(memoryStore(), checkingHasher);
    await openRoom.createUser({ name: "Mestre", password: "", role: USER_ROLES.GAMEMASTER });
    expect(await openRoom.acceptsGameMasterPassword("")).toBe(true);
    expect(await new UserService(memoryStore(), checkingHasher).acceptsGameMasterPassword("")).toBe(true);
  });
});

describe("importUser", () => {
  it("copies an account from another world unless the id or name is taken", async () => {
    const service = await serviceWithMaster();
    const outsider: UserDocument = { _id: "AbCdEfGhIjKlMnOp", name: "Outro Mestre", role: USER_ROLES.GAMEMASTER, color: "#fff", avatar: null, character: null, flags: {}, passwordHash: "x" };
    expect(await service.importUser(outsider)).toBe(true);
    expect(await service.importUser({ ...outsider, _id: "ZzZzZzZzZzZzZzZz" })).toBe(false);
    expect(service.listJoinableUsers().find((user) => user.name === "Outro Mestre")?.isGameMaster).toBe(true);
  });
});
