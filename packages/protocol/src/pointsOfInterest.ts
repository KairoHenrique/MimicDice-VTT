import { z } from "zod";

export const POI_FLAG = "poi";
export const DEFAULT_POI_COLOR = "#eab308";
export const DEFAULT_POI_ICON = "icons/svg/tavern.svg";
export const DEFAULT_POI_SIZE = 44;

export interface PoiCategoryPreset {
  id: string;
  label: string;
  defaultTitle: string;
  icon: string;
  color: string;
}

export const POI_CATEGORY_PRESETS: readonly PoiCategoryPreset[] = [
  { id: "tavern", label: "Taverna & Hospedaria", defaultTitle: "Taverna do Dragão Bêbado", icon: "icons/svg/tavern.svg", color: "#eab308" },
  { id: "blacksmith", label: "Ferreiro & Forja", defaultTitle: "Forja do Martelo de Ferro", icon: "icons/svg/blacksmith.svg", color: "#ef4444" },
  { id: "weapons", label: "Armas & Equipamentos", defaultTitle: "Armaria do Guerreiro", icon: "icons/svg/weapons.svg", color: "#f97316" },
  { id: "shop", label: "Comércio & Mercado", defaultTitle: "Armazém Mercantil", icon: "icons/svg/shop.svg", color: "#10b981" },
  { id: "alchemy", label: "Alquimia & Poções", defaultTitle: "Boticário Alquímico", icon: "icons/svg/alchemy.svg", color: "#8b5cf6" },
  { id: "temple", label: "Templo & Santuário", defaultTitle: "Templo da Luz Sagrada", icon: "icons/svg/temple.svg", color: "#06b6d4" },
  { id: "castle", label: "Castelo & Governo", defaultTitle: "Castelo do Senhor Feudal", icon: "icons/svg/castle.svg", color: "#3b82f6" },
  { id: "shield", label: "Posto da Guarda", defaultTitle: "Guarnição da Guarda", icon: "icons/svg/shield.svg", color: "#6366f1" },
  { id: "skull", label: "Covil & Perigo", defaultTitle: "Covil Sombrio", icon: "icons/svg/skull.svg", color: "#dc2626" },
  { id: "mystery", label: "Missão & Mistério", defaultTitle: "Local de Investigação", icon: "icons/svg/mystery.svg", color: "#d946ef" },
  { id: "pin", label: "Ponto de Referência", defaultTitle: "Praça Central", icon: "icons/svg/pin.svg", color: "#ec4899" },
  { id: "book", label: "Diário & Registro", defaultTitle: "Biblioteca & Arquivo", icon: "icons/svg/book.svg", color: "#0284c7" },
];

export const pointOfInterestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).default(""),
  icon: z.string().trim().max(256).default(DEFAULT_POI_ICON),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_POI_COLOR),
  description: z.string().max(10_000).default(""),
  gmNotes: z.string().max(10_000).default(""),
  image: z.string().trim().max(2048).default(""),
  hidden: z.boolean().default(false),
});

export type PointOfInterest = z.infer<typeof pointOfInterestSchema>;

export function readPointOfInterest(worldFlags: unknown): PointOfInterest | null {
  const flags = (worldFlags && typeof worldFlags === "object" ? worldFlags : {}) as Record<string, unknown>;
  const parsed = pointOfInterestSchema.safeParse(flags[POI_FLAG]);
  return parsed.success ? parsed.data : null;
}

export function createPointOfInterestSource(poi: PointOfInterest, size = DEFAULT_POI_SIZE): Record<string, unknown> {
  return {
    text: poi.title,
    texture: {
      src: poi.icon,
      tint: poi.color,
    },
    iconSize: size,
    global: true,
    flags: {
      world: {
        [POI_FLAG]: poi,
        hidden: poi.hidden,
      },
    },
  };
}
