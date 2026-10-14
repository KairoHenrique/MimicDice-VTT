import type { ApiErrorResponse, JoinableUserRecord, ServerStatusResponse, SessionResponse } from "@tabbletop/protocol";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as T & Partial<ApiErrorResponse>;
  if (!response.ok) throw new ApiError(response.status, body.error ?? `Erro ${response.status}`);
  return body;
}

export async function getJson<T>(url: string): Promise<T> {
  return readJson<T>(await fetch(url, { credentials: "same-origin" }));
}

export async function sendJson<T>(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson<T>(response);
}

export const serverApi = {
  status: () => getJson<ServerStatusResponse>("/api/status"),
  joinableUsers: () => getJson<JoinableUserRecord[]>("/api/join/users"),
  async session(): Promise<SessionResponse | null> {
    try {
      return await getJson<SessionResponse>("/api/session");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  setup: (body: { worldTitle: string; gameMasterName: string; gameMasterPassword: string }) => sendJson<SessionResponse>("POST", "/api/setup", body),
  join: (body: { userId: string; password: string }) => sendJson<SessionResponse>("POST", "/api/join", body),
  joinAsPlayer: (body: { name: string }) => sendJson<SessionResponse>("POST", "/api/join/player", body),
  logout: () => sendJson<void>("POST", "/api/logout"),
};
