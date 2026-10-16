import type { ApiErrorResponse, RpgFolderListing, RpgFolderTreeNode } from "@tabbletop/protocol";
import { ApiError, getJson } from "../net/apiClient";

const BASE = "/api/rpgs";

async function sendRpgJson<T>(method: "POST" | "PUT", route: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${route}`, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as T & Partial<ApiErrorResponse>;
  if (!response.ok) throw new ApiError(response.status, payload.error ?? `Erro ${response.status}`);
  return payload;
}

function query(parameters: Record<string, string>): string {
  return new URLSearchParams(parameters).toString();
}

export function fileUrl(entryPath: string, download = false): string {
  return `${BASE}/file?${query({ path: entryPath, ...(download ? { download: "1" } : {}) })}`;
}

/** XHR instead of fetch so the page can show upload progress. */
function uploadFile(folderPath: string, file: File, onProgress: (fraction: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${BASE}/upload?${query({ path: folderPath, name: file.name })}`);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    request.addEventListener("load", () => {
      let payload: { path?: string; error?: string } = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300 && payload.path) resolve(payload.path);
      else reject(new ApiError(request.status, payload.error ?? (request.status === 413 ? "Arquivo grande demais" : `Erro ${request.status}`)));
    });
    request.addEventListener("error", () => reject(new ApiError(0, "Falha de conexão durante o envio")));
    request.send(file);
  });
}

export const rpgsApi = {
  list: (folderPath: string) => getJson<RpgFolderListing>(`${BASE}/list?${query({ path: folderPath })}`),
  tree: () => getJson<RpgFolderTreeNode>(`${BASE}/tree`),
  readText: (filePath: string) => getJson<{ content: string }>(`${BASE}/text?${query({ path: filePath })}`),
  writeText: (filePath: string, content: string) => sendRpgJson<void>("PUT", "/text", { path: filePath, content }),
  createFolder: (folderPath: string, name: string) => sendRpgJson<{ path: string }>("POST", "/folder", { path: folderPath, name }),
  rename: (entryPath: string, newName: string) => sendRpgJson<{ path: string }>("POST", "/rename", { path: entryPath, newName }),
  move: (entryPath: string, destination: string) => sendRpgJson<{ path: string }>("POST", "/move", { path: entryPath, destination }),
  copy: (entryPath: string, destination: string) => sendRpgJson<{ path: string }>("POST", "/copy", { path: entryPath, destination }),
  remove: (entryPath: string) => sendRpgJson<void>("POST", "/delete", { path: entryPath }),
  /** Deletes several entries; deeper paths go first so a folder is emptied before it is removed. */
  async removeMany(paths: readonly string[]): Promise<void> {
    const unique = [...new Set(paths.filter((path) => path.length > 0))];
    unique.sort((left, right) => right.split("/").length - left.split("/").length || right.localeCompare(left));
    try {
      await sendRpgJson<void>("POST", "/delete-many", { paths: unique });
    } catch {
      const failures: string[] = [];
      for (const path of unique) {
        try {
          await sendRpgJson<void>("POST", "/delete", { path });
        } catch (error) {
          failures.push(error instanceof Error ? error.message : path);
        }
      }
      if (failures.length === unique.length) throw new ApiError(400, failures[0] ?? "Não foi possível apagar");
      if (failures.length) throw new ApiError(400, `${failures.length} item(ns) não puderam ser apagados`);
    }
  },
  uploadFile,
};
