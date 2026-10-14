import type { FileBrowseResult } from "@tabbletop/protocol";
import { HttpError } from "../errors/HttpError";
import { parseTarget, UPLOADS_ROOT, type FileStorage } from "./FileStorage";
import type { PlayerFolderSharing } from "./PlayerFolderSharing";

export const PLAYER_UPLOADS_FOLDER = "players";
const GROUP_ROOT: readonly string[] = [UPLOADS_ROOT, PLAYER_UPLOADS_FOLDER];
const GROUP_PATH = GROUP_ROOT.join("/");
const USER_ID_PATTERN = /^[A-Za-z0-9]{1,32}$/;
const OWN_FOLDER_LABEL = "Minha pasta";
const SHARED_FOLDERS_LABEL = "Pastas compartilhadas";
const PLAYER_FOLDERS_LABEL = "Pastas dos jogadores";

/** Player names for folder labels; never exposes anything but the display name. */
export type PlayerNameLookup = (userId: string) => string | null;

function startsWith(segments: readonly string[], prefix: readonly string[]): boolean {
  return segments.length >= prefix.length && prefix.every((segment, index) => segments[index] === segment);
}

function ownRoot(userId: string): string[] {
  if (!USER_ID_PATTERN.test(userId)) throw HttpError.forbidden();
  return [...GROUP_ROOT, userId];
}

/**
 * What a player may reach in the uploads area: their own folder (read-write) and the top-level folders other
 * players chose to share (read-only). The GM's files are never listed. The GM keeps full access elsewhere.
 */
export class PlayerFileArea {
  constructor(
    private readonly storage: FileStorage,
    private readonly sharing: PlayerFolderSharing,
    private readonly playerName: PlayerNameLookup,
  ) {}

  async browse(userId: string, target: string, extensions: ReadonlySet<string> | null): Promise<FileBrowseResult> {
    const segments = parseTarget(target);
    const root = ownRoot(userId);
    if (startsWith(segments, root)) return this.#browseOwn(userId, segments, extensions);
    if (segments.length === GROUP_ROOT.length && startsWith(segments, GROUP_ROOT)) return this.#browseGroup(userId);
    if (await this.#isSharedWithGroup(segments, userId)) return this.#browseShared(segments, extensions);
    return this.#browseOwn(userId, root, extensions);
  }

  /** Uploads and new folders always land in the player's own folder. */
  writableTarget(userId: string, target: string): string {
    const segments = parseTarget(target);
    const root = ownRoot(userId);
    return (startsWith(segments, root) ? segments : root).join("/");
  }

  newFolderTarget(userId: string, target: string): string {
    const segments = parseTarget(target);
    if (!startsWith(segments, ownRoot(userId)) || segments.length === ownRoot(userId).length) throw HttpError.badRequest("Crie a pasta dentro da sua pasta");
    return segments.join("/");
  }

  async setShared(userId: string, target: string, shared: boolean): Promise<void> {
    const segments = parseTarget(target);
    const root = ownRoot(userId);
    if (segments.length !== root.length + 1 || !startsWith(segments, root)) throw HttpError.forbidden("Só dá para compartilhar pastas que estão direto na sua pasta");
    if (!(await this.storage.isDirectory(segments))) throw HttpError.notFound("Pasta não encontrada");
    await this.sharing.setShared(userId, segments[root.length] as string, shared);
  }

  /** The GM sees every player's folder (and may write in it) under "Pastas dos jogadores", each named after its owner. */
  async labelPlayerFolders(result: FileBrowseResult): Promise<FileBrowseResult> {
    if (result.target === UPLOADS_ROOT) {
      const dirs = result.dirs.includes(GROUP_PATH) ? result.dirs : [GROUP_PATH, ...result.dirs];
      if (!result.dirs.includes(GROUP_PATH)) await this.storage.listFolder(GROUP_ROOT, null);
      return { ...result, dirs, labels: { ...result.labels, [GROUP_PATH]: PLAYER_FOLDERS_LABEL } };
    }
    const labels: Record<string, string> = { ...result.labels };
    if (result.target === GROUP_PATH) {
      labels[GROUP_PATH] = PLAYER_FOLDERS_LABEL;
      for (const directory of result.dirs) {
        const name = this.playerName(directory.split("/").pop() ?? "");
        if (name) labels[directory] = `Pasta de ${name}`;
      }
    }
    const ownerId = startsWith(parseTarget(result.target), GROUP_ROOT) ? result.target.split("/")[GROUP_ROOT.length] : undefined;
    const ownerName = ownerId ? this.playerName(ownerId) : null;
    if (ownerName && result.target.split("/").length === GROUP_ROOT.length + 1) labels[result.target] = `Pasta de ${ownerName}`;
    return { ...result, labels };
  }

  async #browseOwn(userId: string, segments: readonly string[], extensions: ReadonlySet<string> | null): Promise<FileBrowseResult> {
    const listing = await this.storage.listFolder(segments, extensions);
    const root = ownRoot(userId);
    const atRoot = segments.length === root.length;
    const labels: Record<string, string> = { [root.join("/")]: OWN_FOLDER_LABEL, [GROUP_PATH]: SHARED_FOLDERS_LABEL };
    if (!atRoot) return { ...listing, writable: true, parent: segments.slice(0, -1).join("/"), labels };
    const shared = await this.sharing.sharedFoldersOf(userId);
    const shareable = Object.fromEntries(listing.dirs.map((directory) => [directory, shared.has(directory.split("/").pop() ?? "")]));
    return { ...listing, dirs: [GROUP_PATH, ...listing.dirs], writable: true, parent: null, labels, shareable };
  }

  async #browseGroup(userId: string): Promise<FileBrowseResult> {
    const dirs: string[] = [];
    const labels: Record<string, string> = { [GROUP_PATH]: SHARED_FOLDERS_LABEL };
    for (const [ownerId, folders] of await this.sharing.allShared()) {
      const ownerName = ownerId === userId ? null : this.playerName(ownerId);
      if (!ownerName) continue;
      for (const folder of folders) {
        const segments = [...GROUP_ROOT, ownerId, folder];
        if (!(await this.storage.isDirectory(segments))) continue;
        const folderPath = segments.join("/");
        dirs.push(folderPath);
        labels[folderPath] = `${folder} (de ${ownerName})`;
      }
    }
    return { target: GROUP_PATH, dirs, files: [], writable: false, parent: ownRoot(userId).join("/"), labels };
  }

  async #browseShared(segments: readonly string[], extensions: ReadonlySet<string> | null): Promise<FileBrowseResult> {
    const listing = await this.storage.listFolder(segments, extensions);
    const atSharedRoot = segments.length === GROUP_ROOT.length + 2;
    return { ...listing, writable: false, parent: atSharedRoot ? GROUP_PATH : segments.slice(0, -1).join("/") };
  }

  async #isSharedWithGroup(segments: readonly string[], userId: string): Promise<boolean> {
    if (segments.length < GROUP_ROOT.length + 2 || !startsWith(segments, GROUP_ROOT)) return false;
    const ownerId = segments[GROUP_ROOT.length] as string;
    if (ownerId === userId || !this.playerName(ownerId)) return false;
    return (await this.sharing.sharedFoldersOf(ownerId)).has(segments[GROUP_ROOT.length + 1] as string);
  }
}
