import { activateWorldRequestSchema, createWorldRequestSchema, deleteWorldRequestSchema, renameWorldRequestSchema, type WorldSummaryRecord } from "@tabbletop/protocol";
import type { RoomsResult } from "./ipcChannels";

const LAUNCHER_TOKEN_HEADER = "x-mimicdice-launcher";
const REQUEST_TIMEOUT_MS = 20_000;
const GENERIC_ERROR = "Não foi possível falar com o servidor.";

/** Talks to the local server's launcher routes with the secret generated for this run. */
export class RoomsClient {
  constructor(
    private readonly port: number,
    private readonly token: string,
  ) {}

  list(): Promise<RoomsResult<WorldSummaryRecord[]>> {
    return this.#request<WorldSummaryRecord[]>("GET", "/worlds");
  }

  create(title: unknown): Promise<RoomsResult<{ id: string }>> {
    const parsed = createWorldRequestSchema.safeParse({ title });
    if (!parsed.success) return Promise.resolve({ ok: false, error: "Nome de sala inválido (até 80 caracteres, sem < > \" ' ` \\)." });
    return this.#request("POST", "/worlds", parsed.data);
  }

  activate(worldId: unknown): Promise<RoomsResult<{ id: string }>> {
    const parsed = activateWorldRequestSchema.safeParse({ worldId });
    if (!parsed.success) return Promise.resolve({ ok: false, error: "Sala inválida." });
    return this.#request("POST", "/worlds/activate", parsed.data);
  }

  delete(worldId: unknown, password: unknown): Promise<RoomsResult<{ id: string }>> {
    const parsed = deleteWorldRequestSchema.safeParse({ worldId, password });
    if (!parsed.success) return Promise.resolve({ ok: false, error: "Sala ou senha inválida." });
    return this.#request("POST", "/worlds/delete", parsed.data);
  }

  rename(worldId: unknown, title: unknown, password: unknown): Promise<RoomsResult<{ id: string }>> {
    const parsed = renameWorldRequestSchema.safeParse({ worldId, title, password });
    if (!parsed.success) return Promise.resolve({ ok: false, error: "Nome de sala inválido (até 80 caracteres, sem < > \" ' ` \\)." });
    return this.#request("POST", "/worlds/rename", parsed.data);
  }

  async #request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<RoomsResult<T>> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/api/launcher${path}`, {
        method,
        headers: { [LAUNCHER_TOKEN_HEADER]: this.token, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) return { ok: false, error: readError(payload) };
      return { ok: true, value: payload as T };
    } catch {
      return { ok: false, error: GENERIC_ERROR };
    }
  }
}

function readError(payload: unknown): string {
  const message = typeof payload === "object" && payload !== null ? (payload as { error?: unknown }).error : undefined;
  return typeof message === "string" && message.length <= 300 ? message : GENERIC_ERROR;
}
