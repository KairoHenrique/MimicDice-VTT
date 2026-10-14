import { currentUi } from "../../runtime";
import { ApplicationV2, type ApplicationConfiguration } from "../ApplicationV2";

interface ImagePopoutOptions extends Partial<ApplicationConfiguration> {
  src?: string;
  caption?: string;
  uuid?: string | null;
  showTitle?: boolean;
}

const MAXIMUM_CAPTION_LENGTH = 500;

/** Shows one image in its own window. Sharing to other players is not available yet. */
export class ImagePopout extends ApplicationV2 {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "image-popout-{id}",
    classes: ["image-popout"],
    window: { title: "Imagem", frame: true, positioned: true, icon: "fa-solid fa-image", controls: [], minimizable: true, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: 640, height: "auto" },
  };

  readonly src: string;
  readonly caption: string;
  readonly uuid: string | null;

  constructor(options: ImagePopoutOptions = {}) {
    super(options);
    this.src = String(options.src ?? "");
    this.caption = String(options.caption ?? "").slice(0, MAXIMUM_CAPTION_LENGTH);
    this.uuid = options.uuid ?? null;
  }

  override async _renderHTML(): Promise<HTMLElement> {
    const figure = document.createElement("figure");
    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.caption;
    image.style.maxWidth = "100%";
    figure.append(image);
    if (this.caption) {
      const caption = document.createElement("figcaption");
      caption.textContent = this.caption;
      figure.append(caption);
    }
    return figure;
  }

  override _replaceHTML(result: unknown, content: HTMLElement): void {
    content.replaceChildren(result as HTMLElement);
  }

  shareImage(): void {
    currentUi()?.notifications?.info("Compartilhar imagens com os jogadores ainda não está disponível.");
  }
}
