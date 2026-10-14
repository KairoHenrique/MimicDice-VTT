import { currentConfig } from "../runtime";
import { Collection } from "../utils/Collection";
import { ApplicationV2, type ApplicationConfiguration } from "./ApplicationV2";

interface StatusEffectChoice {
  id: string;
  _id: string;
  title: string;
  src: string;
  isActive: boolean;
  isOverlay: boolean;
  cssClass: string;
}

/**
 * Token HUD contract. Tabbletop's token actions live in the canvas context menu; this class carries the
 * overridable pieces packages wrap (status effect choices) and is not rendered on its own.
 */
export class TokenHUD extends ApplicationV2 {
  object: any = null;

  get document(): any {
    return this.object?.document ?? null;
  }

  get actor(): any {
    return this.object?.actor ?? null;
  }

  bind(object: unknown): void {
    this.object = object;
  }

  _getStatusEffectChoices(): Record<string, StatusEffectChoice> {
    const statuses: Set<string> = this.actor?.statuses ?? new Set();
    const choices: Record<string, StatusEffectChoice> = {};
    for (const status of (currentConfig()?.statusEffects ?? []) as Array<{ id?: string; name?: string; label?: string; img?: string; icon?: string }>) {
      if (!status?.id) continue;
      const isActive = statuses.has(status.id);
      choices[status.id] = { id: status.id, _id: status.id, title: String(status.name ?? status.label ?? status.id), src: String(status.img ?? status.icon ?? ""), isActive, isOverlay: false, cssClass: isActive ? "active" : "" };
    }
    return choices;
  }

  override async _renderHTML(): Promise<HTMLElement> {
    return document.createElement("div");
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    content.replaceChildren(result as HTMLElement);
  }
}

/** Compendium packs are not supported yet; the collection exists so packages can type-check and iterate safely. */
export class CompendiumCollection extends Collection<unknown> {
  readonly metadata: Record<string, unknown>;

  constructor(metadata: Record<string, unknown> = {}) {
    super();
    this.metadata = metadata;
  }

  get collection(): string {
    return `${String(this.metadata.packageName ?? "world")}.${String(this.metadata.name ?? "")}`;
  }

  get documentName(): string {
    return String(this.metadata.type ?? "");
  }

  get locked(): boolean {
    return true;
  }

  async getIndex(): Promise<Collection<unknown>> {
    return new Collection();
  }

  async getDocuments(): Promise<unknown[]> {
    return [];
  }

  async getDocument(): Promise<null> {
    return null;
  }

  static async createCompendium(): Promise<never> {
    throw new Error("Compêndios ainda não são suportados pelo MimicDice VTT.");
  }
}

/** Macro editor placeholder: macros are not supported yet, but packages extend this sheet class at load time. */
export class MacroConfig extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = { id: "macro-config-{id}", classes: ["macro-sheet"] };

  override async _renderHTML(): Promise<HTMLElement> {
    const notice = document.createElement("p");
    notice.textContent = "Macros ainda não são suportadas.";
    return notice;
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    content.replaceChildren(result as HTMLElement);
  }
}

/** Window for one compendium pack; never opened because packs are unavailable. */
export class Compendium extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = { id: "compendium-{id}", classes: ["compendium"] };

  override async _renderHTML(): Promise<HTMLElement> {
    const notice = document.createElement("p");
    notice.textContent = "Compêndios ainda não são suportados.";
    return notice;
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    content.replaceChildren(result as HTMLElement);
  }
}
