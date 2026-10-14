const RANDOM_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomID(length = 16): string {
  const randomValues = crypto.getRandomValues(new Uint32Array(length));
  let identifier = "";
  for (const randomValue of randomValues) identifier += RANDOM_ID_ALPHABET[randomValue % RANDOM_ID_ALPHABET.length];
  return identifier;
}

function isNumericString(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

export function isNewerVersion(candidate: string | number, reference: string | number): boolean {
  if (typeof candidate === "number" && typeof reference === "number") return candidate > reference;
  const candidateParts = String(candidate).split(".");
  const referenceParts = String(reference).split(".");
  for (const [index, candidatePart] of candidateParts.entries()) {
    const referencePart = referenceParts[index];
    if (referencePart === undefined) return true;
    if (candidatePart === referencePart) continue;
    if (isNumericString(candidatePart) && isNumericString(referencePart)) return Number(candidatePart) > Number(referencePart);
    return candidatePart.localeCompare(referencePart) > 0;
  }
  return false;
}

export function debounce<TArgs extends unknown[]>(callback: (...args: TArgs) => unknown, delayMs: number): (...args: TArgs) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function debounced(this: unknown, ...args: TArgs) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback.apply(this, args), delayMs);
  };
}

export function throttle<TArgs extends unknown[]>(callback: (...args: TArgs) => unknown, delayMs: number): (...args: TArgs) => void {
  let lastInvocation = 0;
  let pendingTimeout: ReturnType<typeof setTimeout> | undefined;
  return function throttled(this: unknown, ...args: TArgs) {
    const elapsed = Date.now() - lastInvocation;
    clearTimeout(pendingTimeout);
    if (elapsed >= delayMs) {
      lastInvocation = Date.now();
      callback.apply(this, args);
      return;
    }
    pendingTimeout = setTimeout(() => {
      lastInvocation = Date.now();
      callback.apply(this, args);
    }, delayMs - elapsed);
  };
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };

export function escapeHTML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function encodeURL(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");
}

export function timeSince(timeStamp: Date | string | number): string {
  const elapsedSeconds = Math.max(0, (Date.now() - new Date(timeStamp).getTime()) / 1000);
  if (elapsedSeconds < 60) return "agora";
  const units: Array<[number, string]> = [
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  const [divisor, suffix] = units.find(([unitSeconds]) => elapsedSeconds >= unitSeconds) as [number, string];
  return `${Math.floor(elapsedSeconds / divisor)}${suffix}`;
}
