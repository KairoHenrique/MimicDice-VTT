import { currentConfig } from "../../runtime";

export interface FontFileDefinition {
  urls?: string[];
  weight?: string | number;
  style?: string;
}

export interface FontFamilyDefinition {
  editor?: boolean;
  fonts?: FontFileDefinition[];
}

const MAX_FONT_FILES_PER_FAMILY = 8;
const loadedFamilies = new Set<string>();

function fontDefinitions(): Record<string, FontFamilyDefinition> {
  const config = currentConfig();
  config.fontDefinitions ??= {};
  return config.fontDefinitions as Record<string, FontFamilyDefinition>;
}

function isSameOriginUrl(url: string): boolean {
  try {
    return new URL(url, window.location.origin + "/").origin === window.location.origin;
  } catch {
    return false;
  }
}

/** Font registry API (`foundry.applications.settings.menus.FontConfig`); system fonts need no files. */
export class FontConfig {
  static getAvailableFonts(): string[] {
    return Object.keys(fontDefinitions());
  }

  static getAvailableFontChoices(): Record<string, string> {
    return Object.fromEntries(FontConfig.getAvailableFonts().map((family) => [family, family]));
  }

  /** Loads a family's font files (same-origin only, so packages cannot make the client fetch arbitrary hosts). */
  static async loadFont(family: string, definition: FontFamilyDefinition = {}): Promise<boolean> {
    if (typeof family !== "string" || !family) return false;
    fontDefinitions()[family] ??= { editor: definition.editor ?? false, fonts: definition.fonts ?? [] };
    if (loadedFamilies.has(family)) return true;
    const files = (definition.fonts ?? []).slice(0, MAX_FONT_FILES_PER_FAMILY);
    const urls = files.flatMap((file) => (file.urls ?? []).filter(isSameOriginUrl).map((url) => ({ url, file })));
    const results = await Promise.allSettled(
      urls.map(async ({ url, file }) => {
        const face = new FontFace(family, `url("${encodeURI(url)}")`, { weight: String(file.weight ?? "normal"), style: file.style ?? "normal" });
        document.fonts.add(await face.load());
      }),
    );
    const loaded = urls.length === 0 || results.some((result) => result.status === "fulfilled");
    if (loaded) loadedFamilies.add(family);
    return loaded;
  }

  static async loadFonts(): Promise<void> {
    await Promise.all(Object.entries(fontDefinitions()).map(([family, definition]) => FontConfig.loadFont(family, definition)));
  }
}

/** Fonts every OS ships, so packages that list fonts have choices without bundling third-party font files. */
export const DEFAULT_FONT_DEFINITIONS: Record<string, FontFamilyDefinition> = {
  Arial: { editor: true, fonts: [] },
  Georgia: { editor: true, fonts: [] },
  "Courier New": { editor: true, fonts: [] },
  "Times New Roman": { editor: true, fonts: [] },
  Verdana: { editor: true, fonts: [] },
  "Trebuchet MS": { editor: true, fonts: [] },
};
