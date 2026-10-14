import { renderTemplate } from "../handlebars/templates";
import type { ApplicationV2, RenderOptions } from "./ApplicationV2";

export interface HandlebarsTemplatePart {
  template: string;
  id?: string;
  classes?: string[];
  templates?: string[];
  scrollable?: string[];
  [extra: string]: unknown;
}

type ApplicationConstructor = abstract new (...args: any[]) => ApplicationV2;

export function HandlebarsApplicationMixin<TBase extends ApplicationConstructor>(BaseApplication: TBase) {
  abstract class HandlebarsApplication extends BaseApplication {
    static PARTS: Record<string, HandlebarsTemplatePart> = {};

    get parts(): Record<string, HTMLElement> {
      const parts: Record<string, HTMLElement> = {};
      for (const element of Array.from(this.element?.querySelectorAll<HTMLElement>("[data-application-part]") ?? [])) {
        parts[element.dataset.applicationPart as string] = element;
      }
      return parts;
    }

    _configureRenderParts(_options: RenderOptions): Record<string, HandlebarsTemplatePart> {
      return { ...(this.constructor as unknown as { PARTS: Record<string, HandlebarsTemplatePart> }).PARTS };
    }

    async _preparePartContext(_partId: string, context: Record<string, unknown>, _options: RenderOptions): Promise<Record<string, unknown>> {
      return context;
    }

    override async _renderHTML(context: Record<string, unknown>, options: RenderOptions): Promise<Record<string, HTMLElement>> {
      const configuredParts = this._configureRenderParts(options);
      const requestedPartIds = options.parts ?? Object.keys(configuredParts);
      const renderedParts: Record<string, HTMLElement> = {};
      for (const partId of requestedPartIds) {
        const part = configuredParts[partId];
        if (!part) continue;
        const partContext = await this._preparePartContext(partId, { ...context, partId }, options);
        const html = await renderTemplate(part.template, partContext);
        const template = document.createElement("template");
        template.innerHTML = html.trim();
        const rootElement = template.content.firstElementChild as HTMLElement | null;
        if (!rootElement || template.content.children.length !== 1) {
          throw new Error(`Template part "${partId}" must render a single HTML element`);
        }
        rootElement.dataset.applicationPart = partId;
        if (part.id) rootElement.id = `${this.id}-${part.id}`;
        if (part.classes) rootElement.classList.add(...part.classes);
        renderedParts[partId] = rootElement;
      }
      return renderedParts;
    }

    override _replaceHTML(result: Record<string, HTMLElement>, content: HTMLElement, _options: RenderOptions): void {
      for (const [partId, element] of Object.entries(result)) {
        const existing = content.querySelector(`[data-application-part="${CSS.escape(partId)}"]`);
        if (existing) existing.replaceWith(element);
        else content.append(element);
      }
    }
  }
  return HandlebarsApplication;
}
