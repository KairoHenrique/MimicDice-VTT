import { AUDIO_FILE_EXTENSIONS, fileExtension } from "../helpers/media";
import { setSoundContextProvider, Sound, type SoundPlaybackOptions } from "./Sound";

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/** `game.audio`: owns the shared AudioContext and defers work until the browser allows sound (first user gesture). */
export class AudioHelper {
  /** Callbacks packages queue for after the audio context is unlocked. */
  readonly pending: Array<() => void> = [];
  #context: AudioContext | null = null;
  #unlocked = false;

  constructor() {
    setSoundContextProvider(() => this.interface);
    const unlock = () => {
      for (const eventName of UNLOCK_EVENTS) document.removeEventListener(eventName, unlock, true);
      this.#unlock();
    };
    for (const eventName of UNLOCK_EVENTS) document.addEventListener(eventName, unlock, { capture: true });
  }

  get interface(): AudioContext {
    this.#context ??= new AudioContext();
    return this.#context;
  }

  get locked(): boolean {
    return !this.#unlocked;
  }

  get unlock(): Promise<void> {
    if (this.#unlocked) return Promise.resolve();
    return new Promise((resolve) => this.pending.push(() => resolve()));
  }

  #unlock(): void {
    this.#unlocked = true;
    void this.interface.resume();
    for (const callback of this.pending.splice(0)) {
      try {
        callback();
      } catch (error) {
        console.warn("MimicDice | Falha em callback de áudio pendente", error);
      }
    }
  }

  async create({ src }: { src: string }): Promise<Sound> {
    return new Sound(src, { context: this.interface });
  }

  static hasAudioExtension(path: string): boolean {
    return fileExtension(path) in AUDIO_FILE_EXTENSIONS;
  }

  static async preloadSound(src: string): Promise<Sound> {
    return new Sound(src).load();
  }

  /** v13 signature: `play(data, socketOptions)`; broadcasting to other clients is the caller's responsibility here. */
  static async play({ src, volume = 0.8, loop = false }: { src: string } & SoundPlaybackOptions, _socketOptions?: unknown): Promise<Sound | null> {
    try {
      return await new Sound(src).play({ volume, loop });
    } catch (error) {
      console.warn("MimicDice | Não foi possível tocar o som", error);
      return null;
    }
  }
}
