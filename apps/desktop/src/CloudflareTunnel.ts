import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { TunnelStatus } from "./ipcChannels";

const execFileAsync = promisify(execFile);

const DOWNLOAD_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
const BINARY_NAME = "cloudflared.exe";
const PUBLIC_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const START_TIMEOUT_MS = 45_000;
const MAX_ERROR_DETAIL = 200;
/** Windows checks this name in the file's digital signature before the app ever runs it. */
const EXPECTED_SIGNER = "Cloudflare";

export interface CloudflareTunnelOptions {
  port: number;
  binDirectory: string;
  logFilePath: string;
}

class TunnelStoppedError extends Error {}

/**
 * Optional public link through a Cloudflare quick tunnel. The official `cloudflared.exe` is downloaded once, its
 * signature is checked, and it only runs while the GM keeps the switch on. LAN and Radmin keep working alongside.
 */
export class CloudflareTunnel {
  #status: TunnelStatus = { phase: "off" };
  #child: ChildProcess | null = null;
  #logStream: WriteStream | null = null;
  #download: AbortController | null = null;
  #listeners = new Set<() => void>();

  constructor(private readonly options: CloudflareTunnelOptions) {}

  get status(): TunnelStatus {
    return { ...this.#status };
  }

  get #binaryPath(): string {
    return path.join(this.options.binDirectory, BINARY_NAME);
  }

  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  async start(): Promise<void> {
    if (this.#status.phase === "downloading" || this.#status.phase === "starting" || this.#status.phase === "on") return;
    if (process.platform !== "win32") return this.#fail("O link pela internet só está disponível no Windows.");
    try {
      if (!existsSync(this.#binaryPath)) await this.#downloadBinary();
      await this.#launch();
    } catch (error) {
      if (error instanceof TunnelStoppedError) return;
      this.#stopChild();
      this.#fail(error instanceof Error ? error.message : "Não foi possível ligar o link pela internet.");
    }
  }

  stop(): void {
    this.#download?.abort();
    this.#download = null;
    this.#stopChild();
    this.#setStatus({ phase: "off" });
  }

  async #downloadBinary(): Promise<void> {
    this.#setStatus({ phase: "downloading", percent: 0 });
    await mkdir(this.options.binDirectory, { recursive: true });
    const partialPath = `${this.#binaryPath}.part`;
    const controller = new AbortController();
    this.#download = controller;
    try {
      await this.#fetchTo(partialPath, controller.signal);
      await this.#assertSignedByCloudflare(partialPath);
      await rename(partialPath, this.#binaryPath);
    } catch (error) {
      await rm(partialPath, { force: true });
      if (controller.signal.aborted) throw new TunnelStoppedError();
      throw error;
    } finally {
      if (this.#download === controller) this.#download = null;
    }
  }

  async #fetchTo(filePath: string, signal: AbortSignal): Promise<void> {
    const response = await fetch(DOWNLOAD_URL, { signal, redirect: "follow" }).catch(() => {
      throw new Error("Não deu para baixar o programa da Cloudflare. Confira sua internet e tente de novo.");
    });
    if (!response.ok || !response.body) throw new Error(`Falha ao baixar o programa da Cloudflare (${response.status}).`);
    const total = Number(response.headers.get("content-length")) || 0;
    const file = createWriteStream(filePath);
    let received = 0;
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (!file.write(value)) await new Promise<void>((resolve) => file.once("drain", resolve));
        if (total > 0) this.#setStatus({ phase: "downloading", percent: Math.min(99, Math.floor((received / total) * 100)) });
      }
    } finally {
      await new Promise<void>((resolve) => file.end(resolve));
    }
  }

  /** Refuses any file that Windows does not confirm as signed by Cloudflare. The path goes in through an env var, never the script. */
  async #assertSignedByCloudflare(filePath: string): Promise<void> {
    const script = "$s = Get-AuthenticodeSignature -LiteralPath $env:MIMICDICE_VERIFY_PATH; \"$($s.Status)|$($s.SignerCertificate.Subject)\"";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, MIMICDICE_VERIFY_PATH: filePath },
    }).catch(() => ({ stdout: "" }));
    const [status, subject = ""] = stdout.trim().split("|");
    if (status !== "Valid" || !subject.includes(EXPECTED_SIGNER)) throw new Error("O programa baixado não tem a assinatura oficial da Cloudflare e foi descartado.");
  }

  #launch(): Promise<void> {
    this.#setStatus({ phase: "starting" });
    this.#logStream = createWriteStream(this.options.logFilePath, { flags: "a" });
    const child = spawn(this.#binaryPath, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${this.options.port}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    this.#child = child;
    return new Promise<void>((resolve, reject) => {
      let lastLine = "";
      const timeout = setTimeout(() => reject(new Error("A Cloudflare demorou demais para responder. Tente desligar e ligar de novo.")), START_TIMEOUT_MS);
      const onOutput = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        this.#logStream?.write(text);
        lastLine = text.trim().split(/\r?\n/).pop() ?? lastLine;
        const url = PUBLIC_URL_PATTERN.exec(text)?.[0];
        if (!url || this.#status.phase !== "starting") return;
        clearTimeout(timeout);
        this.#setStatus({ phase: "on", url });
        resolve();
      };
      child.stdout?.on("data", onOutput);
      child.stderr?.on("data", onOutput);
      child.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("Não foi possível abrir o programa da Cloudflare."));
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        if (this.#child !== child) return reject(new TunnelStoppedError());
        this.#child = null;
        this.#logStream?.end();
        this.#logStream = null;
        const detail = lastLine.slice(0, MAX_ERROR_DETAIL);
        if (this.#status.phase === "starting") reject(new Error(detail ? `O túnel não ligou: ${detail}` : "O túnel não ligou."));
        else if (this.#status.phase === "on") this.#fail("O link pela internet caiu. Ligue de novo para gerar um link novo.");
      });
    });
  }

  #stopChild(): void {
    const child = this.#child;
    this.#child = null;
    if (child && child.exitCode === null) child.kill();
    this.#logStream?.end();
    this.#logStream = null;
  }

  #fail(message: string): void {
    this.#setStatus({ phase: "error", error: message });
  }

  #setStatus(status: TunnelStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}
