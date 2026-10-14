import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isLoopbackAddress } from "./networkAddress";

const SECRET_BYTES = 32;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Turns a network address into a keyed hash so bans can recognize a device without ever storing its IP.
 * The key lives only on this PC; without it the stored hashes cannot be linked back to an address.
 */
export class DeviceFingerprinter {
  constructor(private readonly secret: string) {}

  static async inConfigDirectory(configPath: string): Promise<DeviceFingerprinter> {
    const secretPath = path.join(configPath, "device-key.secret");
    try {
      const stored = (await readFile(secretPath, "utf8")).trim();
      if (SECRET_PATTERN.test(stored)) return new DeviceFingerprinter(stored);
    } catch {
      /* Missing or unreadable: a new key is generated below. */
    }
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    await mkdir(configPath, { recursive: true });
    await writeFile(secretPath, secret, { encoding: "utf8", mode: 0o600 });
    return new DeviceFingerprinter(secret);
  }

  /** Null for the host PC itself, which must never be locked out of its own table. */
  keyFor(remoteAddress: string | undefined): string | null {
    if (!remoteAddress || isLoopbackAddress(remoteAddress)) return null;
    const address = remoteAddress.replace(/^::ffff:/, "").toLowerCase();
    return createHmac("sha256", this.secret).update(address).digest("hex");
  }
}
