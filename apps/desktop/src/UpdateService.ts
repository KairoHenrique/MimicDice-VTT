import { app } from "electron";
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import type { UpdateStatus } from "./ipcChannels";

const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[\w.]{1,40})?$/;

function safeVersion(info: UpdateInfo): string | undefined {
  return VERSION_PATTERN.test(info.version) ? info.version : undefined;
}

/**
 * Downloads new releases from the public GitHub repository in the background. electron-updater checks the
 * installer's SHA-512 from latest.yml before installing, and the update only runs when the user asks or quits.
 */
export class UpdateService {
  #status: UpdateStatus = { phase: app.isPackaged ? "idle" : "disabled" };
  #listeners = new Set<() => void>();
  #timer: NodeJS.Timeout | null = null;

  get status(): UpdateStatus {
    return this.#status;
  }

  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  start(): void {
    if (!app.isPackaged) return;
    autoUpdater.logger = null;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    this.#bindEvents();
    void this.check();
    this.#timer = setInterval(() => void this.check(), RECHECK_INTERVAL_MS);
    this.#timer.unref();
  }

  async check(): Promise<void> {
    if (this.#status.phase === "disabled" || this.#status.phase === "downloading" || this.#status.phase === "ready") return;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      this.#set({ phase: "error" });
    }
  }

  /** The caller stops the game server first, so the installer can replace its native modules. */
  install(): boolean {
    if (this.#status.phase !== "ready") return false;
    if (this.#timer) clearInterval(this.#timer);
    autoUpdater.quitAndInstall(true, true);
    return true;
  }

  #bindEvents(): void {
    autoUpdater.on("checking-for-update", () => this.#set({ phase: "checking" }));
    autoUpdater.on("update-not-available", () => this.#set({ phase: "latest" }));
    autoUpdater.on("update-available", (info: UpdateInfo) => this.#set({ phase: "downloading", version: safeVersion(info), percent: 0 }));
    autoUpdater.on("download-progress", (progress: ProgressInfo) => this.#set({ ...this.#status, phase: "downloading", percent: Math.max(0, Math.min(100, Math.round(progress.percent))) }));
    autoUpdater.on("update-downloaded", (info: UpdateInfo) => this.#set({ phase: "ready", version: safeVersion(info) }));
    autoUpdater.on("error", () => {
      if (this.#status.phase !== "ready") this.#set({ phase: "error" });
    });
  }

  #set(status: UpdateStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}
