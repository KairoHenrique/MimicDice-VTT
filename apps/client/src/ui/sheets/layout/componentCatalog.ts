import { SHEET_VALUE_KINDS, type SheetComponentKind } from "@tabbletop/protocol";

export type PaletteGroup = "values" | "actions" | "decoration";

export interface ComponentKindInfo {
  readonly kind: SheetComponentKind;
  readonly label: string;
  readonly icon: string;
  readonly group: PaletteGroup;
  readonly description: string;
  readonly defaultSize: { readonly w: number; readonly h: number };
}

export const PALETTE_GROUP_LABELS: Readonly<Record<PaletteGroup, string>> = {
  values: "Valores",
  actions: "Rolagens e cálculos",
  decoration: "Visual",
};

export const COMPONENT_CATALOG: readonly ComponentKindInfo[] = Object.freeze([
  { kind: "number", label: "Número", icon: "fa-solid fa-hashtag", group: "values", description: "Atributo, perícia ou contador; pode rolar.", defaultSize: { w: 3, h: 2 } },
  { kind: "resource", label: "Barra", icon: "fa-solid fa-heart-pulse", group: "values", description: "Atual / máximo com barra (vida, mana).", defaultSize: { w: 6, h: 2 } },
  { kind: "pips", label: "Bolinhas", icon: "fa-solid fa-circle-dot", group: "values", description: "Marcadores clicáveis (estresse, sucessos).", defaultSize: { w: 4, h: 2 } },
  { kind: "text", label: "Texto curto", icon: "fa-solid fa-font", group: "values", description: "Uma linha: classe, raça, nome.", defaultSize: { w: 4, h: 2 } },
  { kind: "longtext", label: "Texto longo", icon: "fa-solid fa-align-left", group: "values", description: "Anotações, história, magias.", defaultSize: { w: 12, h: 4 } },
  { kind: "checkbox", label: "Caixa", icon: "fa-solid fa-square-check", group: "values", description: "Liga/desliga uma condição.", defaultSize: { w: 3, h: 1 } },
  { kind: "select", label: "Lista de opções", icon: "fa-solid fa-list-ul", group: "values", description: "Escolha uma entre várias opções.", defaultSize: { w: 4, h: 2 } },
  { kind: "list", label: "Tabela", icon: "fa-solid fa-table-list", group: "values", description: "Linhas repetíveis: inventário, magias, ataques.", defaultSize: { w: 12, h: 5 } },
  { kind: "skills", label: "Perícias", icon: "fa-solid fa-list-check", group: "values", description: "Lista de perícias com pontos, total e máximo.", defaultSize: { w: 4, h: 16 } },
  { kind: "roll", label: "Botão de rolagem", icon: "fa-solid fa-dice-d20", group: "actions", description: "Rola uma fórmula com @atalhos.", defaultSize: { w: 3, h: 2 } },
  { kind: "computed", label: "Cálculo", icon: "fa-solid fa-calculator", group: "actions", description: "Mostra um valor calculado, ex.: floor((@forca-10)/2).", defaultSize: { w: 3, h: 2 } },
  { kind: "title", label: "Título", icon: "fa-solid fa-heading", group: "decoration", description: "Cabeçalho de uma área da ficha.", defaultSize: { w: 12, h: 1 } },
  { kind: "label", label: "Texto fixo", icon: "fa-solid fa-paragraph", group: "decoration", description: "Regras, lembretes, instruções.", defaultSize: { w: 6, h: 2 } },
  { kind: "image", label: "Imagem", icon: "fa-solid fa-image", group: "decoration", description: "Brasão, mapa, ilustração.", defaultSize: { w: 4, h: 4 } },
  { kind: "portrait", label: "Retrato", icon: "fa-solid fa-user-astronaut", group: "decoration", description: "A imagem do personagem.", defaultSize: { w: 3, h: 4 } },
  { kind: "divider", label: "Divisória", icon: "fa-solid fa-grip-lines", group: "decoration", description: "Linha para separar blocos.", defaultSize: { w: 12, h: 1 } },
]);

const CATALOG_BY_KIND = new Map(COMPONENT_CATALOG.map((info) => [info.kind, info]));

export function kindInfo(kind: SheetComponentKind): ComponentKindInfo {
  return CATALOG_BY_KIND.get(kind) ?? COMPONENT_CATALOG[0];
}

export function isComponentKind(value: string): value is SheetComponentKind {
  return CATALOG_BY_KIND.has(value as SheetComponentKind);
}

export function storesValue(kind: SheetComponentKind): boolean {
  return (SHEET_VALUE_KINDS as readonly string[]).includes(kind);
}

/** Labels are what players read; a key is only needed for kinds that store or expose a value. */
export function needsKey(kind: SheetComponentKind): boolean {
  return storesValue(kind) || kind === "computed";
}
