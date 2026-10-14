import { createWriteStream, type WriteStream } from "node:fs";
import { utilityProcess, type UtilityProcess } from "electron";

export interface ServerProcessOptions {
  entryPath: string;
  port: number;
  dataPath: string;
  clientDistPath: string;
  logFilePath: string;
}

const READY_POLL_INTERVAL_MS = 250;
const READY_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 5_000;

/** Runs the game server in an isolated Electron utility process and tracks its lifecycle. */
export class ServerProcess {
  #child: UtilityProcess | null = null;
  #logStream: WriteStream | null = null;
  #exitListeners = new Set<(code: number) => void>();

  constructor(private readonly options: ServerProcessOptions) {}

  get localUrl(): string {
    return `http://localhost:${this.options.port}`;
  }

  onUnexpectedExit(listener: (code: number) => void): void {
    this.#exitListeners.add(listener);
  }

  async start(): Promise<void> {
    if (this.#child) return;
    this.#logStream = createWriteStream(this.options.logFilePath, { flags: "a" });
    const child = utilityProcess.fork(this.options.entryPath, [], {
      serviceName: "MimicDice VTT Server",
      stdio: "pipe",
      env: {
        ...process.env,
        NODE_ENV: "production",
        TABBLETOP_PORT: String(this.options.port),
        TABBLETOP_DATA_PATH: this.options.dataPath,
        TABBLETOP_CLIENT_DIST: this.options.clientDistPath,
      },
    });
    child.stdout?.pipe(this.#logStream, { end: false });
    child.stderr?.pipe(this.#logStream, { end: false });
    child.once("exit", (code) => this.#handleExit(child, code));
    this.#child = child;
    await this.#waitUntilReady();
  }

  async stop(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    this.#child = null;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS))]);
    this.#logStream?.end();
    this.#logStream = null;
  }

  #handleExit(child: UtilityProcess, code: number): void {
    if (this.#child !== child) return;
    this.#child = null;
    this.#logStream?.end();
    this.#logStream = null;
    for (const listener of this.#exitListeners) listener(code);
  }

  async #waitUntilReady(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.#child) throw new Error("O servidor fechou durante a inicialização.");
      if (await this.#respondsToHttp()) return;
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
    }
    throw new Error("O servidor demorou demais para iniciar.");
  }

  async #respondsToHttp(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.options.port}/api/status`, { signal: AbortSignal.timeout(1_000) });
      return response.status < 500;
    } catch {
      return false;
    }
  }
}
