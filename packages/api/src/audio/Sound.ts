const MAX_SOUND_BYTES = 20 * 1024 * 1024;

export interface SoundPlaybackOptions {
  volume?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  offset?: number;
}

const decodedBufferCache = new Map<string, Promise<AudioBuffer>>();

function resolveSoundUrl(src: string): string {
  const url = new URL(src, window.location.origin + "/");
  if (url.origin !== window.location.origin && url.protocol !== "blob:" && url.protocol !== "data:") {
    throw new Error("Sons só podem ser carregados do próprio servidor");
  }
  return url.href;
}

async function decodeSound(context: AudioContext, src: string): Promise<AudioBuffer> {
  const response = await fetch(resolveSoundUrl(src));
  if (!response.ok) throw new Error(`Som não encontrado: ${src.slice(0, 120)}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_SOUND_BYTES) throw new Error("Arquivo de som grande demais");
  return context.decodeAudioData(bytes);
}

/** Buffered Web Audio sound with the v13 `foundry.audio.Sound` surface used by packages. */
export class Sound extends EventTarget {
  readonly src: string;
  readonly context: AudioContext;
  buffer: AudioBuffer | null = null;
  #source: AudioBufferSourceNode | null = null;
  #gain: GainNode;

  constructor(src: string, { context }: { context?: AudioContext; forceBuffer?: boolean } = {}) {
    super();
    this.src = src;
    this.context = context ?? soundContextProvider();
    this.#gain = this.context.createGain();
    this.#gain.connect(this.context.destination);
  }

  get loaded(): boolean {
    return this.buffer !== null;
  }

  get playing(): boolean {
    return this.#source !== null;
  }

  get volume(): number {
    return this.#gain.gain.value;
  }

  set volume(value: number) {
    this.#gain.gain.value = Math.min(Math.max(Number(value) || 0, 0), 1);
  }

  async load(): Promise<this> {
    if (this.buffer) return this;
    let pending = decodedBufferCache.get(this.src);
    if (!pending) {
      pending = decodeSound(this.context, this.src);
      decodedBufferCache.set(this.src, pending);
      pending.catch(() => decodedBufferCache.delete(this.src));
    }
    this.buffer = await pending;
    return this;
  }

  async play({ volume = 1, loop = false, loopStart = 0, loopEnd, offset = 0 }: SoundPlaybackOptions = {}): Promise<this> {
    await this.load();
    this.stop();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = loop;
    source.loopStart = loopStart;
    if (loopEnd !== undefined) source.loopEnd = loopEnd;
    this.volume = volume;
    source.connect(this.#gain);
    source.addEventListener("ended", () => {
      if (this.#source === source) this.#source = null;
      this.dispatchEvent(new Event("end"));
    });
    this.#source = source;
    if (!loop && loopEnd !== undefined) source.start(0, loopStart, Math.max(loopEnd - loopStart, 0));
    else source.start(0, offset);
    return this;
  }

  stop(): void {
    try {
      this.#source?.stop();
    } catch {
      /* Already stopped. */
    }
    this.#source = null;
  }
}

let soundContextProvider: () => AudioContext = () => new AudioContext();

export function setSoundContextProvider(provider: () => AudioContext): void {
  soundContextProvider = provider;
}
