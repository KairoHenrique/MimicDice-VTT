import { randomBytes } from "node:crypto";
import { MAX_PLAYERS_PER_WORLD, USER_ROLES, type ChangeUserRoleRequest, type CreateUserRequest, type JoinableUserRecord, type PublicUserRecord, type UserRole } from "@tabbletop/protocol";
import { deepClone, expandObject, mergeObject } from "@tabbletop/common";
import { HttpError } from "../errors/HttpError";
import type { PasswordHasher } from "../security/PasswordHasher";
import { generateDocumentId } from "./documentIds";
import type { DocumentCollectionStore, StoredDocument } from "./WorldDatabase";

export interface UserDocument extends StoredDocument, Omit<PublicUserRecord, "_id"> {
  passwordHash: string;
}

export interface UserProfileChanges {
  _id?: string;
  color?: string;
  avatar?: string | null;
  character?: string | null;
  flags?: Record<string, unknown>;
}

const MAX_USER_FLAGS_BYTES = 256 * 1024;

/** Stored instead of a hash when the Game Master chose to play without a password. */
const NO_PASSWORD = "";

const USER_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#f39c12", "#2c3e50"];

export class UserService {
  readonly #usersById = new Map<string, UserDocument>();
  #playerJoinQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: DocumentCollectionStore<UserDocument>,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async load(): Promise<void> {
    this.#usersById.clear();
    for (const user of await this.store.getAll()) this.#usersById.set(user._id, await this.#withAssignableRole(user));
  }

  /** Older worlds may hold "trusted player" or "assistant" accounts; they collapse into player and Game Master. */
  async #withAssignableRole(user: UserDocument): Promise<UserDocument> {
    if (user.role === USER_ROLES.PLAYER || user.role === USER_ROLES.GAMEMASTER) return user;
    const migrated: UserDocument = { ...user, role: user.role >= USER_ROLES.ASSISTANT ? USER_ROLES.GAMEMASTER : USER_ROLES.PLAYER };
    await this.store.put(migrated);
    return migrated;
  }

  async changeRole(userId: string, request: ChangeUserRoleRequest): Promise<PublicUserRecord> {
    const user = this.#usersById.get(userId);
    if (!user) throw HttpError.notFound("Usuário não encontrado");
    if (request.role === USER_ROLES.PLAYER && user.role >= USER_ROLES.ASSISTANT && this.#otherGameMasterCount(userId) === 0) {
      throw HttpError.conflict("O mundo precisa de pelo menos um mestre");
    }
    const updated: UserDocument = { ...user, role: request.role };
    if (request.role === USER_ROLES.GAMEMASTER) updated.passwordHash = await this.passwordHasher.hashPassword(request.password);
    await this.store.put(updated);
    this.#usersById.set(userId, updated);
    return toPublicUser(updated);
  }

  #otherGameMasterCount(userId: string): number {
    return Array.from(this.#usersById.values()).filter((candidate) => candidate._id !== userId && candidate.role >= USER_ROLES.ASSISTANT).length;
  }

  get userCount(): number {
    return this.#usersById.size;
  }

  getUser(userId: string): UserDocument | undefined {
    return this.#usersById.get(userId);
  }

  isGameMaster(userId: string): boolean {
    const role = this.#usersById.get(userId)?.role ?? USER_ROLES.NONE;
    return role >= USER_ROLES.ASSISTANT;
  }

  listGameMasters(): UserDocument[] {
    return Array.from(this.#usersById.values()).filter((user) => user.role >= USER_ROLES.ASSISTANT);
  }

  listJoinableUsers(characterNameOf: (actorId: string) => string | null = () => null): JoinableUserRecord[] {
    return Array.from(this.#usersById.values(), ({ _id, name, role, character, passwordHash }) => {
      const isGameMaster = role >= USER_ROLES.ASSISTANT;
      return { _id, name, isGameMaster, characterName: !isGameMaster && character ? characterNameOf(character) : null, hasPassword: passwordHash !== NO_PASSWORD };
    });
  }

  findByName(name: string): UserDocument | undefined {
    const normalizedName = name.trim().toLocaleLowerCase();
    return Array.from(this.#usersById.values()).find((user) => user.name.toLocaleLowerCase() === normalizedName);
  }

  /**
   * Name-only entry for players: reuses the player with that name or creates one. Game Master names are refused
   * so their accounts stay behind the password. Serialized so two simultaneous joins never create duplicates.
   */
  joinPlayerByName(name: string): Promise<UserDocument> {
    const attempt = this.#playerJoinQueue.then(() => this.#joinPlayerByName(name.trim()));
    this.#playerJoinQueue = attempt.catch(() => undefined);
    return attempt;
  }

  async #joinPlayerByName(name: string): Promise<UserDocument> {
    const existing = this.findByName(name);
    if (existing) {
      if (existing.role >= USER_ROLES.ASSISTANT) throw HttpError.forbidden("Esse nome é do mestre. Use a opção \"Sou o mestre\" e digite a senha.");
      return existing;
    }
    const playerCount = Array.from(this.#usersById.values()).filter((user) => user.role < USER_ROLES.ASSISTANT).length;
    if (playerCount >= MAX_PLAYERS_PER_WORLD) throw HttpError.conflict("Esta mesa já tem jogadores demais. Peça ao mestre para remover alguém.");
    await this.createUser({ name, password: randomBytes(32).toString("base64url"), role: USER_ROLES.PLAYER });
    return this.findByName(name) as UserDocument;
  }

  listPublicUsers(): PublicUserRecord[] {
    return Array.from(this.#usersById.values(), toPublicUser);
  }

  async createUser(request: CreateUserRequest): Promise<PublicUserRecord> {
    const normalizedName = request.name.toLocaleLowerCase();
    const nameTaken = Array.from(this.#usersById.values()).some((user) => user.name.toLocaleLowerCase() === normalizedName);
    if (nameTaken) throw HttpError.conflict("Já existe um usuário com esse nome");

    const user: UserDocument = {
      _id: generateDocumentId(),
      name: request.name,
      role: request.role as UserRole,
      color: USER_COLORS[this.#usersById.size % USER_COLORS.length],
      avatar: null,
      character: null,
      flags: {},
      passwordHash: await this.#hashOrNone(request.password),
    };
    await this.store.put(user);
    this.#usersById.set(user._id, user);
    return toPublicUser(user);
  }

  /** Copies an account from another world verbatim (same id and password hash), unless its id or name is taken. */
  async importUser(user: UserDocument): Promise<boolean> {
    if (this.#usersById.has(user._id) || this.findByName(user.name)) return false;
    const copy = deepClone(user);
    await this.store.put(copy);
    this.#usersById.set(copy._id, copy);
    return true;
  }

  async deleteUser(userId: string): Promise<void> {
    const user = this.#usersById.get(userId);
    if (!user) throw HttpError.notFound("Usuário não encontrado");
    if (user.role >= USER_ROLES.ASSISTANT && this.#otherGameMasterCount(userId) === 0) {
      throw HttpError.conflict("O mundo precisa de pelo menos um mestre");
    }
    await this.store.delete(userId);
    this.#usersById.delete(userId);
  }

  /** Applies profile changes (never name, role or password) and returns the expanded diff that was stored. */
  async updateProfile(userId: string, changes: UserProfileChanges): Promise<Record<string, unknown>> {
    const user = this.#usersById.get(userId);
    if (!user) throw HttpError.notFound("Usuário não encontrado");
    const updated: UserDocument = deepClone(user);
    if (changes.color !== undefined) updated.color = changes.color;
    if (changes.avatar !== undefined) updated.avatar = changes.avatar;
    if (changes.character !== undefined) updated.character = changes.character;
    if (changes.flags !== undefined) updated.flags = mergeObject(updated.flags, expandObject(changes.flags), { performDeletions: true });
    if (Buffer.byteLength(JSON.stringify(updated.flags), "utf8") > MAX_USER_FLAGS_BYTES) throw HttpError.badRequest("Flags grandes demais");
    this.#usersById.set(userId, updated);
    await this.store.put(updated);
    const { _id: _ignoredId, ...diff } = changes;
    return { _id: userId, ...diff };
  }

  /** Only Game Masters may turn their password off; an empty new password does exactly that. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = this.#usersById.get(userId);
    if (!user || user.role < USER_ROLES.ASSISTANT) throw HttpError.forbidden("Somente o mestre pode mudar a senha");
    if (!(await this.verifyCredentials(userId, currentPassword))) throw HttpError.unauthorized("A senha atual está incorreta");
    const updated: UserDocument = { ...user, passwordHash: await this.#hashOrNone(newPassword) };
    await this.store.put(updated);
    this.#usersById.set(userId, updated);
  }

  #hashOrNone(plainPassword: string): Promise<string> {
    return plainPassword === "" ? Promise.resolve(NO_PASSWORD) : this.passwordHasher.hashPassword(plainPassword);
  }

  async verifyCredentials(userId: string, plainPassword: string): Promise<UserDocument | undefined> {
    const user = this.#usersById.get(userId);
    if (!user) {
      await this.passwordHasher.consumeEquivalentTime(plainPassword);
      return undefined;
    }
    if (user.passwordHash === NO_PASSWORD) return user.role >= USER_ROLES.ASSISTANT ? user : undefined;
    const passwordMatches = await this.passwordHasher.verifyPassword(user.passwordHash, plainPassword);
    return passwordMatches ? user : undefined;
  }
}

function toPublicUser({ passwordHash: _passwordHash, ...publicFields }: UserDocument): PublicUserRecord {
  return publicFields;
}
