import { pathToFileURL } from "node:url";
import { BrowserWindow, shell, type WebContents } from "electron";
import { IPC_CHANNELS } from "./ipcChannels";

export interface WindowManagerOptions {
  launcherHtml: string;
  preload: string;
  icon: string;
  tableUrl: string;
}

const BACKGROUND_COLOR = "#16151a";
const BLANK_POPOUT_URL = "about:blank";

function isExternalWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Owns the launcher (invite screen) and the game table windows, and locks down their navigation. */
export class WindowManager {
  #launcher: BrowserWindow | null = null;
  #table: BrowserWindow | null = null;
  readonly #launcherUrl: string;
  readonly #tableOrigin: string;

  constructor(private readonly options: WindowManagerOptions) {
    this.#launcherUrl = pathToFileURL(options.launcherHtml).href;
    this.#tableOrigin = new URL(options.tableUrl).origin;
  }

  isLauncherFrame(url: string | undefined): boolean {
    return url === this.#launcherUrl;
  }

  openLauncher(): void {
    if (this.#launcher && !this.#launcher.isDestroyed()) {
      this.#focus(this.#launcher);
      return;
    }
    const launcher = new BrowserWindow({
      width: 720,
      height: 760,
      minWidth: 560,
      minHeight: 520,
      title: "MimicDice VTT",
      icon: this.options.icon,
      backgroundColor: BACKGROUND_COLOR,
      autoHideMenuBar: true,
      webPreferences: { preload: this.options.preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    this.#guardNavigation(launcher.webContents, (url) => url === this.#launcherUrl);
    launcher.on("closed", () => {
      this.#launcher = null;
    });
    void launcher.loadURL(this.#launcherUrl);
    this.#launcher = launcher;
  }

  openTable(): void {
    if (this.#table && !this.#table.isDestroyed()) {
      this.#focus(this.#table);
      return;
    }
    const table = new BrowserWindow({
      width: 1440,
      height: 900,
      title: "MimicDice VTT - Mesa",
      icon: this.options.icon,
      backgroundColor: BACKGROUND_COLOR,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.#guardNavigation(table.webContents, (url) => this.#isTableUrl(url));
    table.on("closed", () => {
      this.#table = null;
    });
    table.maximize();
    void table.loadURL(this.options.tableUrl);
    this.#table = table;
  }

  notifyLauncherChanged(): void {
    if (this.#launcher && !this.#launcher.isDestroyed()) this.#launcher.webContents.send(IPC_CHANNELS.stateChanged);
  }

  #isTableUrl(url: string): boolean {
    try {
      return new URL(url).origin === this.#tableOrigin;
    } catch {
      return false;
    }
  }

  #focus(window: BrowserWindow): void {
    if (window.isMinimized()) window.restore();
    window.focus();
  }

  /**
   * Same-origin popouts stay in-app, including the blank windows the table fills with a detached sheet so it can
   * go to another monitor. Anything else opens in the system browser and never inside our windows.
   */
  #guardNavigation(contents: WebContents, isAllowed: (url: string) => boolean): void {
    contents.on("will-navigate", (event, url) => {
      if (isAllowed(url)) return;
      event.preventDefault();
      if (isExternalWebUrl(url)) void shell.openExternal(url);
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (this.#isTableUrl(url) || url === BLANK_POPOUT_URL) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            icon: this.options.icon,
            backgroundColor: BACKGROUND_COLOR,
            webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, plugins: true, backgroundThrottling: false },
          },
        };
      }
      if (isExternalWebUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("did-create-window", (child) => this.#guardNavigation(child.webContents, (url) => this.#isTableUrl(url) || url === BLANK_POPOUT_URL));
  }
}
