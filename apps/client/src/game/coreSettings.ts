import type { ClientSettings } from "@tabbletop/api";
import { ACTOR_CATEGORIES_SETTING } from "../ui/actors/actorCategoryStore";
import { DEFAULT_TEMPLATES_SETTING, MIMICDICE_SETTINGS_NAMESPACE, SHEET_TEMPLATES_SETTING } from "../ui/sheets/layout/sheetTemplateStore";
import { registerTableSettings } from "./tableControls";

export const LANGUAGE_STORAGE_KEY = "core.language";
export const DEFAULT_LANGUAGE = "pt-BR";

export function readPreferredLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string) : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function registerCoreSettings(settings: ClientSettings): void {
  settings.register("core", "moduleConfiguration", {
    name: "Module Configuration",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    requiresReload: true,
  });
  settings.register("core", "permissions", {
    name: "Permissões por papel",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
  settings.register("core", "rollMode", {
    name: "Modo de rolagem",
    scope: "client",
    config: false,
    type: String,
    default: "publicroll",
    choices: { publicroll: "Pública", gmroll: "Só o mestre", blindroll: "Às cegas", selfroll: "Só eu" },
  });
  settings.register("core", "diceAnimation", {
    name: "Animar dados",
    hint: "Mostra os dados rolando na tela. Desligado automaticamente quando o Dice So Nice está ativo.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
  settings.register("core", "noCanvas", {
    name: "Desativar o mapa",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
  settings.register("core", "performanceMode", {
    name: "Qualidade gráfica",
    hint: "Afeta efeitos visuais do mapa e de módulos como o Dice So Nice.",
    scope: "client",
    config: true,
    type: Number,
    default: 2,
    choices: { 0: "Baixa", 1: "Média", 2: "Alta", 3: "Máxima" },
    requiresReload: true,
  });
  settings.register("core", "language", {
    name: "SETTINGS.LangN",
    scope: "client",
    config: true,
    type: String,
    default: DEFAULT_LANGUAGE,
    choices: { "pt-BR": "Português (Brasil)", en: "English" },
    requiresReload: true,
  });
  registerPackageFacingSettings(settings);
  registerMimicDiceSettings(settings);
  registerTableSettings(settings);
}

/** Sheet models are shared with the world; actor categories are the GM's private view (user scope). */
function registerMimicDiceSettings(settings: ClientSettings): void {
  const rerenderActors = () => void ui.actors?.render();
  settings.register(MIMICDICE_SETTINGS_NAMESPACE, SHEET_TEMPLATES_SETTING, { name: "Modelos de ficha", scope: "world", config: false, type: Object, default: { templates: [] } });
  settings.register(MIMICDICE_SETTINGS_NAMESPACE, DEFAULT_TEMPLATES_SETTING, { name: "Ficha padrão por tipo", scope: "world", config: false, type: Object, default: {} });
  settings.register(MIMICDICE_SETTINGS_NAMESPACE, ACTOR_CATEGORIES_SETTING, { name: "Categorias de atores", scope: "user", config: false, type: Object, default: { categories: [] }, onChange: rerenderActors });
}

/** Hidden core settings that popular packages read; they keep Foundry's names and defaults. */
function registerPackageFacingSettings(settings: ClientSettings): void {
  const hidden = { config: false } as const;
  settings.register("core", "collectionSortingModes", { ...hidden, name: "Collection sorting", scope: "client", type: Object, default: {} });
  settings.register("core", "globalInterfaceVolume", { ...hidden, name: "Interface volume", scope: "client", type: Number, default: 0.5 });
  settings.register("core", "maxFPS", { ...hidden, name: "Max FPS", scope: "client", type: Number, default: 60 });
  settings.register("core", "photosensitiveMode", { ...hidden, name: "Photosensitive mode", scope: "client", type: Boolean, default: false });
  settings.register("core", "pixelRatioResolutionScaling", { ...hidden, name: "Resolution scaling", scope: "client", type: Boolean, default: true });
  settings.register("core", "fonts", { ...hidden, name: "Fonts", scope: "world", type: Object, default: {} });
}
