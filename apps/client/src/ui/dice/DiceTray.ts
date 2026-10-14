import { h } from "../../views/dom";
import { rollAnimationParts } from "./rollAnimationParts";

const MAX_ANIMATED_DICE = 16;
const TUMBLE_MS = 1000;
const FACE_CYCLE_MS = 70;
const HOLD_MS = 1500;
const FADE_MS = 400;
const KNOWN_SHAPES = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100]);

interface AnimatedDie {
  element: HTMLElement;
  face: HTMLElement;
  finalLabel: string;
  faces: number;
  discarded: boolean;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function shapeClass(term: any): string {
  const denomination = term.constructor?.DENOMINATION;
  if (denomination === "c") return "shape-coin";
  if (denomination === "f") return "shape-fate";
  return KNOWN_SHAPES.has(term.faces) ? `shape-d${term.faces}` : "shape-generic";
}

/**
 * Lightweight 2D dice animation shown to everyone who can see a roll. Results come from the chat message,
 * so every client lands on the same faces; this only animates, it never rolls.
 */
export class DiceTray {
  readonly #layer: HTMLElement;
  #audioContext: AudioContext | null = null;

  constructor() {
    this.#layer = h("div", { id: "dice-tray", "aria-hidden": "true" });
    document.body.append(this.#layer);
  }

  async show(rolls: any[], color: string | undefined): Promise<void> {
    const parts = rollAnimationParts(rolls, MAX_ANIMATED_DICE);
    if (parts.dice.length === 0) return;
    const dice = parts.dice.map((part, index) => this.#createDie(part.term, part.result, part.discarded, index));
    const group = h("div", { class: "dice-group" });
    if (color && /^#[0-9a-f]{6}$/i.test(color)) group.style.setProperty("--die-color", color);
    for (const die of dice) group.append(die.element);
    for (const bonus of parts.bonuses) group.append(h("span", { class: "anim-bonus" }, bonus));
    const total = this.#totalChip(rolls, dice.length, parts.bonuses.length);
    this.#layer.append(group);

    if (!prefersReducedMotion()) {
      this.#playRattle();
      await this.#tumble(dice);
    }
    for (const die of dice) {
      die.face.textContent = die.finalLabel;
      die.element.classList.add("settled");
      die.element.classList.toggle("discarded", die.discarded);
    }
    if (total) group.append(total);
    await wait(HOLD_MS);
    group.classList.add("fading");
    await wait(FADE_MS);
    group.remove();
  }

  /** "= 17" once the dice land, when the total is more than a single die's face. */
  #totalChip(rolls: any[], diceCount: number, bonusCount: number): HTMLElement | null {
    const total = rolls.length === 1 ? Number(rolls[0]?.total) : NaN;
    if (!Number.isFinite(total) || (diceCount < 2 && bonusCount === 0)) return null;
    return h("span", { class: "anim-total" }, `= ${total}`);
  }

  #createDie(term: any, result: any, discarded: boolean, index: number): AnimatedDie {
    const face = h("span", { class: "die-face" });
    const element = h("div", { class: `anim-die ${shapeClass(term)}` }, face);
    const angle = Math.random() * Math.PI * 2;
    element.style.setProperty("--from-x", `${Math.round(Math.cos(angle) * 420)}px`);
    element.style.setProperty("--from-y", `${Math.round(Math.sin(angle) * 260)}px`);
    element.style.setProperty("--spin", `${Math.round(540 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1)}deg`);
    element.style.setProperty("--delay", `${index * 45}ms`);
    const faces = Math.max(Number(term.faces) || 6, 1);
    return { element, face, finalLabel: String(term.getResultLabel?.(result) ?? result.result), faces, discarded };
  }

  async #tumble(dice: AnimatedDie[]): Promise<void> {
    const startedAt = performance.now();
    while (performance.now() - startedAt < TUMBLE_MS) {
      for (const die of dice) die.face.textContent = String(1 + Math.floor(Math.random() * die.faces));
      await wait(FACE_CYCLE_MS);
    }
  }

  /** Short synthesized clatter; no audio assets are shipped or fetched. */
  #playRattle(): void {
    try {
      this.#audioContext ??= new AudioContext();
      const context = this.#audioContext;
      if (context.state === "suspended") void context.resume();
      for (let hit = 0; hit < 5; hit += 1) this.#scheduleClick(context, context.currentTime + hit * 0.09 + Math.random() * 0.04, 0.35 - hit * 0.05);
    } catch {
      /* Audio is optional (blocked autoplay, missing API). */
    }
  }

  #scheduleClick(context: AudioContext, startTime: number, volume: number): void {
    const length = Math.floor(context.sampleRate * 0.03);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800 + Math.random() * 1600;
    const gain = context.createGain();
    gain.gain.value = Math.max(volume, 0.05);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(startTime);
  }
}
