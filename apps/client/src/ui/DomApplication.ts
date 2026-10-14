import { ApplicationV2, type RenderOptions } from "@tabbletop/api";

/** ApplicationV2 rendered from DOM nodes, so core UI never interpolates user text into HTML strings. */
export abstract class DomApplication extends ApplicationV2 {
  abstract buildContent(context: Record<string, unknown>, options: RenderOptions): Node[];

  override async _renderHTML(context: Record<string, unknown>, options: RenderOptions): Promise<Node[]> {
    return this.buildContent(context, options);
  }

  override _replaceHTML(result: Node[], content: HTMLElement): void {
    content.replaceChildren(...result);
  }
}
