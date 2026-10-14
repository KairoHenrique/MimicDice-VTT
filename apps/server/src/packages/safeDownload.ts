import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { isPrivateNetworkAddress } from "../security/networkAddress";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export class DownloadError extends Error {
  constructor(publicMessage: string) {
    super(publicMessage);
    this.name = "DownloadError";
  }
}

async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DownloadError("URL inválida");
  }
  if (url.protocol !== "https:") throw new DownloadError("Só URLs https são aceitas");
  if (url.username || url.password) throw new DownloadError("URL com credenciais não é aceita");

  const resolvedAddresses = await lookup(url.hostname, { all: true }).catch(() => {
    throw new DownloadError("Não foi possível resolver o endereço");
  });
  if (resolvedAddresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new DownloadError("Endereços de rede local não são aceitos");
  }
  return url;
}

async function fetchFollowingSafeRedirects(rawUrl: string): Promise<Response> {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const url = await assertPublicHttpsUrl(currentUrl);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, url).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new DownloadError(`Download falhou (HTTP ${response.status})`);
    return response;
  }
  throw new DownloadError("Redirecionamentos demais");
}

function createByteLimiter(maxBytes: number): Transform {
  let receivedBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) callback(new DownloadError("Arquivo maior que o limite permitido"));
      else callback(null, chunk);
    },
  });
}

export async function downloadJson(rawUrl: string, maxBytes: number): Promise<unknown> {
  const response = await fetchFollowingSafeRedirects(rawUrl);
  const chunks: Buffer[] = [];
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), createByteLimiter(maxBytes), async function* collect(source) {
    for await (const chunk of source) chunks.push(chunk as Buffer);
  });
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DownloadError("O manifesto não é um JSON válido");
  }
}

export async function downloadToFile(rawUrl: string, destinationPath: string, maxBytes: number): Promise<void> {
  const response = await fetchFollowingSafeRedirects(rawUrl);
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), createByteLimiter(maxBytes), createWriteStream(destinationPath));
}
