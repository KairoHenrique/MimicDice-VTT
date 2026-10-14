import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const REMEMBER_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_USER = 10;
const MAX_DEVICES_TOTAL = 500;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const storedDeviceSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  userId: z.string().regex(/^[A-Za-z0-9]{16}$/),
  worldId: z.string().min(1).max(200),
  expiresAt: z.number().int(),
});
type StoredDevice = z.infer<typeof storedDeviceSchema>;

export interface RememberedDevice {
  token: string;
  expiresAt: number;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * "Remember my password" without storing the password: the browser keeps a random token in an httpOnly cookie
 * and only its SHA-256 hash is written to disk, so a leaked file cannot be replayed.
 */
export class RememberedDeviceStore {
  #devices: StoredDevice[] = [];
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  static inConfigDirectory(configPath: string): RememberedDeviceStore {
    return new RememberedDeviceStore(path.join(configPath, "remembered-devices.json"));
  }

  get lifetimeMs(): number {
    return REMEMBER_LIFETIME_MS;
  }

  async load(): Promise<void> {
    try {
      const parsed = z.array(storedDeviceSchema).safeParse(JSON.parse(await readFile(this.filePath, "utf8")));
      this.#devices = parsed.success ? parsed.data.filter((device) => device.expiresAt > Date.now()) : [];
    } catch {
      this.#devices = [];
    }
  }

  async remember(userId: string, worldId: string): Promise<RememberedDevice> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + REMEMBER_LIFETIME_MS;
    const now = Date.now();
    const others = this.#devices.filter((device) => device.expiresAt > now);
    const forUser = others.filter((device) => device.userId === userId);
    const dropped = new Set(forUser.slice(0, Math.max(0, forUser.length - MAX_DEVICES_PER_USER + 1)));
    this.#devices = [...others.filter((device) => !dropped.has(device)), { tokenHash: hashToken(token), userId, worldId, expiresAt }].slice(-MAX_DEVICES_TOTAL);
    await this.#persist();
    return { token, expiresAt };
  }

  /** Returns who the token belongs to without consuming it. */
  peek(token: string | undefined, worldId: string): string | null {
    return this.#find(token, worldId)?.userId ?? null;
  }

  /** Each use swaps the token for a new one, so a copied cookie stops working once the owner signs in again. */
  async rotate(token: string | undefined, worldId: string): Promise<{ userId: string; device: RememberedDevice } | null> {
    const found = this.#find(token, worldId);
    if (!found) return null;
    this.#devices = this.#devices.filter((device) => device !== found);
    const device = await this.remember(found.userId, worldId);
    return { userId: found.userId, device };
  }

  async forget(token: string | undefined): Promise<void> {
    if (!token || !TOKEN_PATTERN.test(token)) return;
    const tokenHash = hashToken(token);
    const before = this.#devices.length;
    this.#devices = this.#devices.filter((device) => device.tokenHash !== tokenHash);
    if (this.#devices.length !== before) await this.#persist();
  }

  async forgetUser(userId: string): Promise<void> {
    const before = this.#devices.length;
    this.#devices = this.#devices.filter((device) => device.userId !== userId);
    if (this.#devices.length !== before) await this.#persist();
  }

  #find(token: string | undefined, worldId: string): StoredDevice | undefined {
    if (!token || !TOKEN_PATTERN.test(token)) return undefined;
    const tokenHash = hashToken(token);
    return this.#devices.find((device) => device.tokenHash === tokenHash && device.worldId === worldId && device.expiresAt > Date.now());
  }

  #persist(): Promise<void> {
    const snapshot = JSON.stringify(this.#devices);
    this.#writeQueue = this.#writeQueue.catch(() => undefined).then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    });
    return this.#writeQueue;
  }
}
