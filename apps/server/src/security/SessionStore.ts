import { randomBytes } from "node:crypto";

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

type SessionRevokedListener = (session: Session) => void;

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export class SessionStore {
  readonly #sessions = new Map<string, Session>();
  readonly #revokedListeners = new Set<SessionRevokedListener>();
  readonly #sweepTimer: NodeJS.Timeout;

  constructor(private readonly sessionLifetimeMs: number) {
    this.#sweepTimer = setInterval(() => this.#sweepExpiredSessions(), SWEEP_INTERVAL_MS);
    this.#sweepTimer.unref();
  }

  create(userId: string): Session {
    const session: Session = {
      token: randomBytes(32).toString("base64url"),
      userId,
      expiresAt: Date.now() + this.sessionLifetimeMs,
    };
    this.#sessions.set(session.token, session);
    return session;
  }

  resolve(token: string | undefined): Session | undefined {
    if (!token) return undefined;
    const session = this.#sessions.get(token);
    if (!session) return undefined;
    if (session.expiresAt <= Date.now()) {
      this.revoke(token);
      return undefined;
    }
    return session;
  }

  revoke(token: string): void {
    const session = this.#sessions.get(token);
    if (!session) return;
    this.#sessions.delete(token);
    for (const listener of this.#revokedListeners) listener(session);
  }

  revokeAllForUser(userId: string): void {
    for (const session of Array.from(this.#sessions.values())) {
      if (session.userId === userId) this.revoke(session.token);
    }
  }

  onRevoked(listener: SessionRevokedListener): void {
    this.#revokedListeners.add(listener);
  }

  dispose(): void {
    clearInterval(this.#sweepTimer);
    this.#sessions.clear();
  }

  #sweepExpiredSessions(): void {
    const now = Date.now();
    for (const session of Array.from(this.#sessions.values())) {
      if (session.expiresAt <= now) this.revoke(session.token);
    }
  }
}
