const EXISTENCE_CACHE_LIMIT = 500;
const existenceCache = new Map<string, Promise<boolean>>();

/** The server is always mounted at the origin root, so routes are plain absolute paths. */
export function getRoute(path: string, { prefix }: { prefix?: string | null } = {}): string {
  const segments = [prefix, String(path ?? "")].filter((segment): segment is string => Boolean(segment)).map((segment) => segment.replace(/^\/+|\/+$/g, ""));
  return `/${segments.filter(Boolean).join("/")}`;
}

/** Whether a same-origin asset exists. Results are cached because packages probe the same files repeatedly. */
export function srcExists(source: string): Promise<boolean> {
  const key = String(source ?? "");
  if (!key) return Promise.resolve(false);
  const cached = existenceCache.get(key);
  if (cached) return cached;
  if (existenceCache.size >= EXISTENCE_CACHE_LIMIT) existenceCache.delete(existenceCache.keys().next().value as string);
  const probe = fetch(key, { method: "HEAD", credentials: "same-origin" })
    .then((response) => response.ok)
    .catch(() => false);
  existenceCache.set(key, probe);
  return probe;
}

/** Tabbletop has no S3 storage; every path is reported as a local (non-bucket) path. */
export function parseS3URL(key: string): { bucket: string | null; keyPrefix: string } {
  return { bucket: null, keyPrefix: String(key ?? "") };
}
