import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTIONS = Object.freeze({ memoryCost: 19456, timeCost: 2, parallelism: 1 });

export class PasswordHasher {
  #timingEqualizerHash: Promise<string> | undefined;

  hashPassword(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_OPTIONS);
  }

  async verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      return false;
    }
  }

  async consumeEquivalentTime(plainPassword: string): Promise<void> {
    this.#timingEqualizerHash ??= this.hashPassword("timing-equalizer-not-a-real-password");
    await this.verifyPassword(await this.#timingEqualizerHash, plainPassword);
  }
}
