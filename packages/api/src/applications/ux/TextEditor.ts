import { fromUuid } from "../../documents/abstract/ClientDatabaseBackend";
import { currentConfig, globalScope } from "../../runtime";
import { FilePicker } from "../apps/FilePicker";
import { RichTextEditor, type RichTextEditorOptions } from "./RichTextEditor";
import { applyEnricher, CORE_ENRICHERS, type EnrichmentOptions, type TextEnricherConfig } from "./textEnrichers";

export type { EnrichmentOptions, TextEnricherConfig };

export interface TextEditorCreateOptions extends Partial<RichTextEditorOptions> {
  target: HTMLElement;
  engine?: string;
  [extra: string]: unknown;
}

function pickImageWithFilePicker(): Promise<string | null> {
  return new Promise((resolve) => {
    const picker = new FilePicker.implementation({ type: "image", callback: (path) => resolve(path) });
    picker.addEventListener("close", () => resolve(null), { once: true });
    void picker.render({ force: true });
  });
}

/** `TextEditor`: HTML enrichment (content links, inline rolls, secrets) and rich-text editor creation. */
export class TextEditor {
  static #listenersActive = false;

  static get implementation(): typeof TextEditor {
    return (currentConfig()?.ux?.TextEditor as typeof TextEditor | undefined) ?? TextEditor;
  }

  static async enrichHTML(content: unknown, options: EnrichmentOptions = {}): Promise<string> {
    if (content === null || content === undefined || content === "") return "";
    const template = document.createElement("template");
    template.innerHTML = String(content);
    if (!options.secrets) template.content.querySelectorAll("section.secret").forEach((secret) => secret.remove());
    for (const enricher of this.#activeEnrichers(options)) await applyEnricher(template.content, enricher, options);
    return template.innerHTML;
  }

  static #activeEnrichers(options: EnrichmentOptions): TextEnricherConfig[] {
    const enrichers: TextEnricherConfig[] = [];
    if (options.documents !== false) enrichers.push(CORE_ENRICHERS.documents);
    if (options.custom !== false) enrichers.push(...((currentConfig()?.TextEditor?.enrichers ?? []) as TextEnricherConfig[]));
    if (options.rolls !== false) enrichers.push(CORE_ENRICHERS.rolls);
    if (options.links !== false) enrichers.push(CORE_ENRICHERS.links);
    return enrichers;
  }

  static async create(options: TextEditorCreateOptions, content = ""): Promise<RichTextEditor> {
    return new RichTextEditor({ pickImage: pickImageWithFilePicker, ...options }, content);
  }

  static decodeHTML(html: string): string {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(html ?? "");
    return textarea.value;
  }

  static previewHTML(content: string, length = 250): string {
    return this.truncateText(this.#plainText(content), { maxLength: length });
  }

  static truncateHTML(html: HTMLElement): HTMLElement {
    return html;
  }

  static truncateText(text: string, { maxLength = 50, splitWords = true, suffix = "…" }: { maxLength?: number; splitWords?: boolean; suffix?: string } = {}): string {
    if (text.length <= maxLength) return text;
    let truncated = text.slice(0, maxLength);
    if (!splitWords && truncated.includes(" ")) truncated = truncated.slice(0, truncated.lastIndexOf(" "));
    return `${truncated.trimEnd()}${suffix}`;
  }

  static getDragEventData(event: DragEvent): Record<string, unknown> {
    if (!(event instanceof DragEvent)) return {};
    try {
      const parsed: unknown = JSON.parse(event.dataTransfer?.getData("text/plain") ?? "");
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  static getContentLink(document: { uuid?: string; name?: string } | null): string {
    return document?.uuid ? `@UUID[${document.uuid}]{${document.name ?? ""}}` : "";
  }

  /** Document-level delegation for links and rolls produced by `enrichHTML`, wherever they are rendered. */
  static activateListeners(): void {
    if (this.#listenersActive) return;
    this.#listenersActive = true;
    document.body.addEventListener("click", (event) => void this.#onClick(event));
    document.body.addEventListener("dragstart", (event) => this.#onDragStart(event));
  }

  static #plainText(content: string): string {
    const template = document.createElement("template");
    template.innerHTML = String(content ?? "");
    return (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  static async #onClick(event: MouseEvent): Promise<void> {
    const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("a.content-link, a.inline-roll");
    if (!target || target.classList.contains("broken")) return;
    event.preventDefault();
    if (target.classList.contains("content-link")) await this.#openContentLink(target);
    else if (target.dataset.mode) await this.#rollDeferred(target);
    else target.classList.toggle("expanded");
  }

  static async #openContentLink(link: HTMLElement): Promise<void> {
    const linked = (await fromUuid(link.dataset.uuid)) as any;
    if (!linked) return;
    if (linked.documentName === "Scene") linked.view?.();
    else linked.sheet?.render?.({ force: true });
  }

  static async #rollDeferred(link: HTMLElement): Promise<void> {
    const RollClass = currentConfig()?.Dice?.rolls?.[0] ?? globalScope.Roll;
    const roll = new RollClass(link.dataset.formula ?? "");
    await roll.toMessage({ flavor: link.textContent?.trim() || undefined }, { rollMode: link.dataset.mode === "roll" ? undefined : link.dataset.mode });
  }

  static #onDragStart(event: DragEvent): void {
    const link = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("a.content-link[data-uuid]");
    if (!link || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: link.dataset.type, uuid: link.dataset.uuid }));
  }
}
