import { Hooks } from "../hooks/Hooks";

export type CompatibilityStatus = "ok" | "warning" | "failed";

export interface CompatibilityIssue {
  kind: "load" | "runtime";
  location: string;
  message: string;
  count: number;
}

export interface PackageCompatibilityReport {
  packageId: string;
  status: CompatibilityStatus;
  issues: CompatibilityIssue[];
}

const MAX_ISSUES_PER_PACKAGE = 20;
const MAX_MESSAGE_LENGTH = 300;
const PACKAGE_URL_PATTERN = /\/(?:modules|systems)\/([A-Za-z0-9_-]+)\//g;

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function stackOf(error: unknown): string {
  return error instanceof Error ? (error.stack ?? "") : "";
}

/** Package ids whose files appear in a stack trace, innermost frame first. */
function packagesInStack(stack: string): string[] {
  const ids: string[] = [];
  for (const match of stack.matchAll(PACKAGE_URL_PATTERN)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

/**
 * Attributes load failures and runtime errors to the add-on that caused them, so the GM can see which
 * packages work. Messages are truncated and never include document data.
 */
export class CompatibilityMonitor {
  readonly #issues = new Map<string, CompatibilityIssue[]>();
  readonly #loadFailed = new Set<string>();
  #installed = false;

  install(): void {
    if (this.#installed || typeof window === "undefined") return;
    this.#installed = true;
    Hooks.on("error", (location: string, error: unknown) => this.recordRuntimeError(location, error));
    window.addEventListener("error", (event) => this.recordRuntimeError("window.error", event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => this.recordRuntimeError("unhandledrejection", event.reason));
  }

  recordLoadFailure(packageId: string, asset: string, error: unknown): void {
    this.#loadFailed.add(packageId);
    this.#add(packageId, { kind: "load", location: asset, message: errorText(error), count: 1 });
  }

  recordRuntimeError(location: string, error: unknown): void {
    const [packageId] = packagesInStack(stackOf(error));
    if (!packageId) return;
    this.#add(packageId, { kind: "runtime", location, message: errorText(error), count: 1 });
  }

  report(packageIds: Iterable<string>): PackageCompatibilityReport[] {
    return Array.from(packageIds, (packageId) => this.reportFor(packageId));
  }

  reportFor(packageId: string): PackageCompatibilityReport {
    const issues = (this.#issues.get(packageId) ?? []).map((issue) => ({ ...issue }));
    const status: CompatibilityStatus = this.#loadFailed.has(packageId) ? "failed" : issues.length > 0 ? "warning" : "ok";
    return { packageId, status, issues };
  }

  #add(packageId: string, issue: CompatibilityIssue): void {
    const message = issue.message.slice(0, MAX_MESSAGE_LENGTH);
    const issues = this.#issues.get(packageId) ?? [];
    const existing = issues.find((candidate) => candidate.location === issue.location && candidate.message === message);
    if (existing) {
      existing.count += 1;
      return;
    }
    if (issues.length >= MAX_ISSUES_PER_PACKAGE) return;
    issues.push({ ...issue, message });
    this.#issues.set(packageId, issues);
  }
}

export const compatibilityMonitor = new CompatibilityMonitor();

/** Returns the dotted global paths (e.g. `foundry.utils.mergeObject`) that do not resolve in this runtime. */
export function probeApi(paths: readonly string[]): string[] {
  return paths.filter((dottedPath) => {
    let target: any = globalThis;
    for (const segment of dottedPath.split(".")) {
      if (target === null || target === undefined) return true;
      target = target[segment];
    }
    return target === undefined;
  });
}
