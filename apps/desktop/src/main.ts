import path from "node:path";
import { cpSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { app, clipboard, ipcMain, session, shell, type IpcMainInvokeEvent } from "electron";
import { DEFAULT_SERVER_PORT } from "@tabbletop/protocol";
import { addFirewallRule, getFirewallStatus, type FirewallStatus } from "./firewall";
import { listInviteAddresses } from "./inviteAddresses";
import { IPC_CHANNELS, type LauncherState, type ServerState } from "./ipcChannels";
import { ServerProcess } from "./ServerProcess";
import { WindowManager } from "./WindowManager";

const MAX_CLIPBOARD_LENGTH = 500;
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write", "fullscreen"]);

function resolvePort(): number {
  const requested = Number(process.env.TABBLETOP_PORT);
  return Number.isInteger(requested) && requested > 0 && requested <= 65535 ? requested : DEFAULT_SERVER_PORT;
}

/** Before the rename the app stored its data under %APPDATA%\Tabbletop; move it once so worlds are kept. */
function migrateLegacyData(dataPath: string): void {
  const legacyDataPath = path.join(app.getPath("appData"), "Tabbletop", "data");
  if (existsSync(dataPath) || !existsSync(legacyDataPath)) return;
  try {
    mkdirSync(path.dirname(dataPath), { recursive: true });
    renameSync(legacyDataPath, dataPath);
  } catch {
    cpSync(legacyDataPath, dataPath, { recursive: true });
  }
}

function resolvePaths() {
  const appPath = app.getAppPath();
  const dataPath = path.join(app.getPath("userData"), "data");
  migrateLegacyData(dataPath);
  const logsPath = app.getPath("logs");
  mkdirSync(dataPath, { recursive: true });
  mkdirSync(logsPath, { recursive: true });
  return {
    dataPath,
    serverEntry: path.join(appPath, "dist", "server", "main.mjs"),
    clientDist: app.isPackaged ? path.join(process.resourcesPath, "client") : path.resolve(appPath, "..", "client", "dist"),
    launcherHtml: path.join(appPath, "dist", "launcher", "index.html"),
    preload: path.join(appPath, "dist", "preload.cjs"),
    serverLog: path.join(logsPath, "server.log"),
  };
}

class DesktopApplication {
  readonly #port = resolvePort();
  readonly #paths = resolvePaths();
  readonly #server = new ServerProcess({
    entryPath: this.#paths.serverEntry,
    port: this.#port,
    dataPath: this.#paths.dataPath,
    clientDistPath: this.#paths.clientDist,
    logFilePath: this.#paths.serverLog,
  });
  readonly #windows = new WindowManager({ launcherHtml: this.#paths.launcherHtml, preload: this.#paths.preload, tableUrl: this.#server.localUrl });
  #serverState: ServerState = "starting";
  #serverError: string | null = null;
  #firewall: FirewallStatus = "missing";
  #quitting = false;

  async run(): Promise<void> {
    this.#restrictPermissions();
    this.#registerIpcHandlers();
    this.#windows.openLauncher();
    this.#server.onUnexpectedExit(() => this.#markServerFailed("O servidor foi encerrado inesperadamente. Veja o log em " + this.#paths.serverLog));
    app.on("before-quit", (event) => this.#handleBeforeQuit(event));
    this.#firewall = await getFirewallStatus(this.#port);
    await this.#startServer();
  }

  focusLauncher(): void {
    this.#windows.openLauncher();
  }

  async #startServer(): Promise<void> {
    try {
      await this.#server.start();
      this.#serverState = "running";
    } catch (error) {
      this.#markServerFailed(error instanceof Error ? error.message : "Falha ao iniciar o servidor");
    }
    this.#windows.notifyLauncherChanged();
  }

  #markServerFailed(message: string): void {
    this.#serverState = "failed";
    this.#serverError = message;
    this.#windows.notifyLauncherChanged();
  }

  #launcherState(): LauncherState {
    return {
      serverState: this.#serverState,
      serverError: this.#serverError,
      localUrl: this.#server.localUrl,
      port: this.#port,
      invites: listInviteAddresses(this.#port),
      firewall: this.#firewall,
      version: app.getVersion(),
    };
  }

  #registerIpcHandlers(): void {
    const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
      ipcMain.handle(channel, (event, ...args) => {
        if (!this.#windows.isLauncherFrame(event.senderFrame?.url)) throw new Error("Origem não autorizada");
        return listener(event, ...args);
      });
    };
    handle(IPC_CHANNELS.getLauncherState, () => this.#launcherState());
    handle(IPC_CHANNELS.openTable, () => {
      if (this.#serverState === "running") this.#windows.openTable();
    });
    handle(IPC_CHANNELS.copyText, (_event, text) => {
      if (typeof text === "string" && text.length <= MAX_CLIPBOARD_LENGTH) clipboard.writeText(text);
    });
    handle(IPC_CHANNELS.allowFirewall, async () => {
      this.#firewall = await addFirewallRule(this.#port);
      return this.#firewall;
    });
    handle(IPC_CHANNELS.openDataFolder, async () => {
      await shell.openPath(this.#paths.dataPath);
    });
  }

  #restrictPermissions(): void {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  }

  #handleBeforeQuit(event: Electron.Event): void {
    if (this.#quitting) return;
    event.preventDefault();
    this.#quitting = true;
    void this.#server.stop().finally(() => app.quit());
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const desktop = new DesktopApplication();
  app.on("second-instance", () => desktop.focusLauncher());
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(() => desktop.run());
}
