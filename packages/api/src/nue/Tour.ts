import { currentGame } from "../runtime";

export interface TourStep {
  id: string;
  title?: string;
  content?: string;
  selector?: string;
  [key: string]: unknown;
}

export interface TourConfig {
  title?: string;
  description?: string;
  steps?: TourStep[];
  localization?: Record<string, string>;
  [key: string]: unknown;
}

function localize(text: string | undefined): string {
  if (!text) return "";
  return currentGame()?.i18n?.localize?.(text) ?? text;
}

/** Plain-text rendering of step HTML: tour content comes from packages and is never injected as markup. */
function toPlainText(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent?.trim() ?? "";
}

/** Guided walkthrough with the `foundry.nue.Tour` lifecycle hooks (`_preStep`, `_postStep`) packages override. */
export class Tour {
  static STATUS = Object.freeze({ UNSTARTED: "unstarted", IN_PROGRESS: "in-progress", COMPLETED: "completed" });
  static activeTour: Tour | null = null;

  static get tourInProgress(): boolean {
    return Tour.activeTour !== null;
  }

  readonly config: TourConfig;
  id: string;
  namespace: string;
  stepIndex: number | null = null;
  #overlay: HTMLElement | null = null;

  constructor(config: TourConfig = {}, { id, namespace }: { id?: string; namespace?: string } = {}) {
    this.config = config;
    this.id = id ?? String(config.id ?? "");
    this.namespace = namespace ?? String(config.namespace ?? "");
  }

  get key(): string {
    return `${this.namespace}.${this.id}`;
  }

  get title(): string {
    return localize(this.config.title);
  }

  get steps(): TourStep[] {
    return Array.isArray(this.config.steps) ? this.config.steps : [];
  }

  get currentStep(): TourStep | null {
    return this.stepIndex === null ? null : (this.steps[this.stepIndex] ?? null);
  }

  get status(): string {
    if (this.stepIndex === null) return Tour.STATUS.UNSTARTED;
    return this.stepIndex >= this.steps.length ? Tour.STATUS.COMPLETED : Tour.STATUS.IN_PROGRESS;
  }

  async start(): Promise<void> {
    Tour.activeTour = this;
    this.stepIndex = -1;
    await this.next();
  }

  async next(): Promise<void> {
    await this.progress((this.stepIndex ?? -1) + 1);
  }

  async previous(): Promise<void> {
    await this.progress(Math.max((this.stepIndex ?? 1) - 1, 0));
  }

  async progress(stepIndex: number): Promise<void> {
    if (stepIndex >= this.steps.length) return this.complete();
    this.stepIndex = stepIndex;
    await this._preStep();
    this.#renderStep();
    await this._postStep();
  }

  async complete(): Promise<void> {
    this.stepIndex = this.steps.length;
    this.exit();
  }

  exit(): void {
    this.#overlay?.remove();
    this.#overlay = null;
    if (Tour.activeTour === this) Tour.activeTour = null;
  }

  async reset(): Promise<void> {
    this.exit();
    this.stepIndex = null;
  }

  async _preStep(): Promise<void> {}

  async _postStep(): Promise<void> {}

  #renderStep(): void {
    const step = this.currentStep;
    if (!step) return;
    this.#overlay?.remove();
    const overlay = document.createElement("aside");
    overlay.className = "tour-step";
    const heading = document.createElement("h3");
    heading.textContent = localize(step.title) || this.title;
    const body = document.createElement("p");
    body.textContent = toPlainText(localize(step.content));
    const actions = document.createElement("footer");
    actions.append(this.#button("Fechar", () => this.exit()), this.#button(this.stepIndex === this.steps.length - 1 ? "Concluir" : "Próximo", () => void this.next()));
    overlay.append(heading, body, actions);
    this.#anchorTo(overlay, step.selector);
    document.body.append(overlay);
    this.#overlay = overlay;
  }

  #button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  #anchorTo(overlay: HTMLElement, selector: string | undefined): void {
    let target: Element | null = null;
    try {
      target = selector ? document.querySelector(selector) : null;
    } catch {
      target = null;
    }
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    overlay.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - 340))}px`;
    overlay.style.top = `${Math.min(bounds.bottom + 8, window.innerHeight - 160)}px`;
  }
}

/** `game.tours`: registry keyed by `namespace.id`. */
export class ToursCollection extends Map<string, Tour> {
  register(namespace: string, id: string, tour: Tour): void {
    tour.namespace = namespace;
    tour.id = id;
    this.set(`${namespace}.${id}`, tour);
  }
}
