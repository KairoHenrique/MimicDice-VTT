import { z } from "zod";

export const ACTOR_ROLES = ["player", "enemy", "npc"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const SHEET_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_SAVED_SHEET_TEMPLATES = 50;
export const MAX_ACTOR_CATEGORIES = 40;
export const MAX_PIPS = 20;

export const SHEET_GRID_COLUMNS = 12;
export const MAX_SHEET_ROWS = 200;
export const MAX_COMPONENT_ROWS = 40;
export const MAX_SHEET_PAGES = 12;
export const MAX_COMPONENTS_PER_PAGE = 150;
export const MAX_LIST_COLUMNS = 8;

/** Components that store a value in the actor under their `key`. */
export const SHEET_VALUE_KINDS = ["number", "resource", "pips", "text", "longtext", "checkbox", "select", "list", "skills"] as const;
/** Components that only display or act: rolls, derived numbers and decoration. */
export const SHEET_STATIC_KINDS = ["roll", "computed", "title", "label", "image", "portrait", "divider"] as const;
export const SHEET_COMPONENT_KINDS = [...SHEET_VALUE_KINDS, ...SHEET_STATIC_KINDS] as const;
export type SheetComponentKind = (typeof SHEET_COMPONENT_KINDS)[number];
export type SheetValueKind = (typeof SHEET_VALUE_KINDS)[number];

export const SHEET_TEXT_SIZES = ["sm", "md", "lg", "xl", "xxl"] as const;
export const SHEET_TEXT_ALIGNS = ["left", "center", "right"] as const;
export const SHEET_LIST_COLUMN_TYPES = ["text", "number", "checkbox"] as const;
export const SHEET_ROLL_MODES = ["sum", "highest", "lowest"] as const;
export type SheetRollMode = (typeof SHEET_ROLL_MODES)[number];
export const SHEET_SKILL_VALUE_STYLES = ["number", "pips"] as const;
export type SheetSkillValueStyle = (typeof SHEET_SKILL_VALUE_STYLES)[number];
export const MAX_SHEET_SKILLS = 80;
export const MAX_SKILL_COLUMNS = 4;
export const MAX_SKILL_POINTS = 100000;

const localIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const documentIdSchema = z.string().regex(/^[A-Za-z0-9]{16}$/);
const labelSchema = z.string().trim().min(1).max(60);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const keySchema = z.string().regex(SHEET_FIELD_KEY_PATTERN);
const formulaSchema = z.string().trim().max(300);
/** Relative server paths or http(s) URLs only; no `javascript:`/`data:` and nothing that could break out of an attribute. */
export const imagePathSchema = z.string().trim().max(500).regex(/^(?!\s*(?:javascript|data|vbscript):)[^\s"'<>`]+$/i);
const initialSchema = z.union([z.number().finite(), z.string().max(2000), z.boolean()]);

export const sheetComponentStyleSchema = z.object({
  text: colorSchema.optional(),
  background: colorSchema.optional(),
  accent: colorSchema.optional(),
  align: z.enum(SHEET_TEXT_ALIGNS).optional(),
  size: z.enum(SHEET_TEXT_SIZES).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  border: z.boolean().optional(),
  hideLabel: z.boolean().optional(),
});
export type SheetComponentStyle = z.infer<typeof sheetComponentStyleSchema>;

export const sheetListColumnSchema = z.object({
  key: keySchema,
  label: labelSchema,
  type: z.enum(SHEET_LIST_COLUMN_TYPES),
});
export type SheetListColumn = z.infer<typeof sheetListColumnSchema>;

export const sheetSkillSchema = z.object({
  key: keySchema,
  label: labelSchema,
});
export type SheetSkill = z.infer<typeof sheetSkillSchema>;

export const sheetComponentSchema = z
  .object({
    id: localIdSchema,
    kind: z.enum(SHEET_COMPONENT_KINDS),
    x: z.number().int().min(0).max(SHEET_GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(MAX_SHEET_ROWS - 1),
    w: z.number().int().min(1).max(SHEET_GRID_COLUMNS),
    h: z.number().int().min(1).max(MAX_COMPONENT_ROWS),
    key: keySchema.optional(),
    label: z.string().trim().max(60).optional(),
    content: z.string().max(4000).optional(),
    formula: formulaSchema.optional(),
    options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    max: z.number().int().min(1).max(MAX_PIPS).optional(),
    min: z.number().finite().optional(),
    step: z.number().positive().max(1000).optional(),
    initial: initialSchema.optional(),
    src: imagePathSchema.optional(),
    columns: z.array(sheetListColumnSchema).max(MAX_LIST_COLUMNS).optional(),
    hint: z.string().trim().max(160).optional(),
    rollable: z.boolean().optional(),
    /** How a dice pool counts: the sum (default), only the highest die or only the lowest die. */
    rollMode: z.enum(SHEET_ROLL_MODES).optional(),
    /** A table that lists the character's inventory items instead of rows stored in the sheet. */
    linkItems: z.boolean().optional(),
    /** Skill list: one stored number per skill under `<key>.<skill>`, shown in 1 to 4 columns. */
    skills: z
      .array(sheetSkillSchema)
      .max(MAX_SHEET_SKILLS)
      .refine((skills) => new Set(skills.map((skill) => skill.key)).size === skills.length, { message: "Perícias repetidas" })
      .optional(),
    skillColumns: z.number().int().min(1).max(MAX_SKILL_COLUMNS).optional(),
    skillStyle: z.enum(SHEET_SKILL_VALUE_STYLES).optional(),
    /** Points a character may spread across the skills; the header warns when the total goes over. */
    pointsMax: z.number().int().min(0).max(MAX_SKILL_POINTS).optional(),
    gmOnly: z.boolean().optional(),
    style: sheetComponentStyleSchema.optional(),
  })
  .refine((component) => component.x + component.w <= SHEET_GRID_COLUMNS, { message: "Componente passa da largura da ficha" })
  .refine((component) => !(SHEET_VALUE_KINDS as readonly string[]).includes(component.kind) || component.key !== undefined, { message: "Componente de valor precisa de atalho" });
export type SheetComponent = z.infer<typeof sheetComponentSchema>;

export const sheetPageSchema = z.object({
  id: localIdSchema,
  title: labelSchema,
  components: z.array(sheetComponentSchema).max(MAX_COMPONENTS_PER_PAGE),
});
export type SheetPage = z.infer<typeof sheetPageSchema>;

export const sheetLayoutSchema = z.object({
  version: z.literal(2),
  pages: z.array(sheetPageSchema).min(1).max(MAX_SHEET_PAGES),
});
export type SheetLayout = z.infer<typeof sheetLayoutSchema>;

/** Version 1 layouts (sections with 1-3 columns) are still accepted and migrated when read. */
export const LEGACY_SHEET_FIELD_TYPES = ["number", "resource", "pips", "text", "longtext", "checkbox", "select", "roll"] as const;
export type LegacySheetFieldType = (typeof LEGACY_SHEET_FIELD_TYPES)[number];

export const legacySheetFieldSchema = z.object({
  id: localIdSchema,
  key: keySchema,
  label: labelSchema,
  type: z.enum(LEGACY_SHEET_FIELD_TYPES),
  formula: formulaSchema.optional(),
  options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  max: z.number().int().min(1).max(MAX_PIPS).optional(),
  initial: initialSchema.optional(),
  color: colorSchema.optional(),
  hint: z.string().trim().max(120).optional(),
});
export type LegacySheetField = z.infer<typeof legacySheetFieldSchema>;

export const legacySheetSectionSchema = z.object({
  id: localIdSchema,
  title: labelSchema,
  columns: z.number().int().min(1).max(3),
  fields: z.array(legacySheetFieldSchema).max(40),
});
export type LegacySheetSection = z.infer<typeof legacySheetSectionSchema>;

export const legacySheetLayoutSchema = z.object({
  version: z.literal(1),
  sections: z.array(legacySheetSectionSchema).max(20),
});
export type LegacySheetLayout = z.infer<typeof legacySheetLayoutSchema>;

export const storedSheetLayoutSchema = z.union([sheetLayoutSchema, legacySheetLayoutSchema]);
export type StoredSheetLayout = z.infer<typeof storedSheetLayoutSchema>;

const templateFields = {
  id: localIdSchema,
  name: labelSchema,
  description: z.string().trim().max(200).optional(),
  role: z.enum(ACTOR_ROLES),
};

export const sheetTemplateSchema = z.object({ ...templateFields, layout: sheetLayoutSchema });
export type SheetTemplate = z.infer<typeof sheetTemplateSchema>;

export const storedSheetTemplateSchema = z.object({ ...templateFields, layout: storedSheetLayoutSchema });
export type StoredSheetTemplate = z.infer<typeof storedSheetTemplateSchema>;

export const SHEET_EXCHANGE_FORMAT = "mimicdice-sheets";
export const MAX_SHEET_EXCHANGE_FILE_BYTES = 2 * 1024 * 1024;

/** Shareable file with one sheet or a whole "system" (set of models); ids are regenerated on import. */
export const sheetExchangeFileSchema = z.object({
  format: z.literal(SHEET_EXCHANGE_FORMAT),
  version: z.literal(1),
  title: labelSchema,
  templates: z
    .array(z.object({ name: labelSchema, description: z.string().trim().max(200).optional(), role: z.enum(ACTOR_ROLES), layout: storedSheetLayoutSchema }))
    .min(1)
    .max(MAX_SAVED_SHEET_TEMPLATES),
});
export type SheetExchangeFile = z.infer<typeof sheetExchangeFileSchema>;

export const savedSheetTemplatesSchema = z.object({
  templates: z.array(storedSheetTemplateSchema).max(MAX_SAVED_SHEET_TEMPLATES),
});
export type SavedSheetTemplates = z.infer<typeof savedSheetTemplatesSchema>;

export const actorCategorySchema = z.object({
  id: localIdSchema,
  name: z.string().trim().min(1).max(40),
  color: colorSchema,
  actorIds: z.array(documentIdSchema).max(2000),
});
export type ActorCategory = z.infer<typeof actorCategorySchema>;

export const actorCategoriesSchema = z.object({
  categories: z.array(actorCategorySchema).max(MAX_ACTOR_CATEGORIES),
});
export type ActorCategories = z.infer<typeof actorCategoriesSchema>;
