import { z } from "zod";
import { SCENE_DOCUMENT_SCHEMAS } from "./sceneSchemas";
import { colorSchema, documentIdSchema, filePathSchema, nameSchema, objectRecordSchema, ownershipSchema } from "./schemaPrimitives";

const commonFields = {
  _id: documentIdSchema.nullish(),
  flags: objectRecordSchema.default({}),
  _stats: objectRecordSchema.default({}),
  sort: z.number().int().default(0),
};

const activeEffectChangeSchema = z.object({
  key: z.string().max(256),
  value: z.string().max(4096).default(""),
  mode: z.number().int().min(0).max(5).default(2),
  priority: z.number().nullable().default(null),
});

export const activeEffectSchema = z.object({
  ...commonFields,
  name: nameSchema,
  img: filePathSchema.nullable().default("icons/svg/aura.svg"),
  type: z.string().max(64).default("base"),
  system: objectRecordSchema.default({}),
  changes: z.array(activeEffectChangeSchema).max(200).default([]),
  disabled: z.boolean().default(false),
  duration: objectRecordSchema.default({}),
  description: z.string().max(100_000).default(""),
  origin: z.string().max(400).nullable().default(null),
  tint: colorSchema.default("#ffffff"),
  transfer: z.boolean().default(true),
  statuses: z.array(z.string().max(128)).max(100).default([]),
});

export const itemSchema = z.object({
  ...commonFields,
  name: nameSchema,
  type: z.string().max(64),
  img: filePathSchema.nullable().default("icons/svg/item-bag.svg"),
  system: objectRecordSchema.default({}),
  effects: z.array(activeEffectSchema).max(500).default([]),
  folder: documentIdSchema.nullable().default(null),
  ownership: ownershipSchema.default({ default: 0 }),
});

export const actorSchema = z.object({
  ...commonFields,
  name: nameSchema,
  type: z.string().max(64),
  img: filePathSchema.nullable().default("icons/svg/mystery-man.svg"),
  system: objectRecordSchema.default({}),
  prototypeToken: objectRecordSchema.default({}),
  items: z.array(itemSchema).max(2000).default([]),
  effects: z.array(activeEffectSchema).max(500).default([]),
  folder: documentIdSchema.nullable().default(null),
  ownership: ownershipSchema.default({ default: 0 }),
});

export const journalEntryPageSchema = z.object({
  ...commonFields,
  name: nameSchema,
  type: z.string().max(64).default("text"),
  system: objectRecordSchema.default({}),
  title: z.object({ show: z.boolean().default(true), level: z.number().int().min(1).max(6).default(1) }).default({ show: true, level: 1 }),
  image: z.object({ caption: z.string().max(1000).optional() }).default({}),
  text: z
    .object({
      content: z.string().max(500_000).nullable().default(null),
      markdown: z.string().max(500_000).optional(),
      format: z.number().int().min(1).max(2).default(1),
    })
    .default({ content: null, format: 1 }),
  video: objectRecordSchema.default({}),
  src: filePathSchema.nullable().default(null),
  category: documentIdSchema.nullable().default(null),
  ownership: ownershipSchema.default({ default: -1 }),
});

export const journalEntrySchema = z.object({
  ...commonFields,
  name: nameSchema,
  pages: z.array(journalEntryPageSchema).max(500).default([]),
  folder: documentIdSchema.nullable().default(null),
  categories: z.array(objectRecordSchema).max(100).default([]),
  ownership: ownershipSchema.default({ default: 0 }),
});

export const folderSchema = z.object({
  ...commonFields,
  name: nameSchema,
  type: z.enum(["Actor", "Item", "JournalEntry", "Scene", "Macro", "Playlist", "RollTable", "Cards", "Adventure", "Compendium"]),
  description: z.string().max(10_000).default(""),
  folder: documentIdSchema.nullable().default(null),
  sorting: z.enum(["a", "m"]).default("a"),
  color: colorSchema.nullable().default(null),
});

const MAX_ROLL_JSON_LENGTH = 64_000;

function isSerializedRoll(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    const roll = parsed as Record<string, unknown>;
    return typeof roll.formula === "string" && (roll.class === undefined || typeof roll.class === "string");
  } catch {
    return false;
  }
}

const serializedRollSchema = z.string().max(MAX_ROLL_JSON_LENGTH).refine(isSerializedRoll, "Rolagem inválida");

const nullableIdSchema = documentIdSchema.nullable().default(null);

export const chatMessageSchema = z.object({
  _id: documentIdSchema.nullish(),
  type: z.string().max(64).default("base"),
  system: objectRecordSchema.default({}),
  style: z.number().int().min(0).max(3).default(0),
  author: nullableIdSchema,
  timestamp: z.number().int().nonnegative().default(0),
  flavor: z.string().max(10_000).default(""),
  content: z.string().max(100_000).default(""),
  speaker: z
    .object({
      scene: nullableIdSchema,
      actor: nullableIdSchema,
      token: nullableIdSchema,
      alias: z.string().trim().max(256).optional(),
    })
    .default({ scene: null, actor: null, token: null }),
  whisper: z.array(documentIdSchema).max(50).default([]),
  blind: z.boolean().default(false),
  rolls: z.array(serializedRollSchema).max(20).default([]),
  sound: filePathSchema.nullable().default(null),
  emote: z.boolean().default(false),
  flags: objectRecordSchema.default({}),
  _stats: objectRecordSchema.default({}),
});

export const DOCUMENT_SCHEMAS: Readonly<Record<string, z.ZodType<Record<string, unknown>>>> = Object.freeze({
  Actor: actorSchema,
  Item: itemSchema,
  ActiveEffect: activeEffectSchema,
  JournalEntry: journalEntrySchema,
  JournalEntryPage: journalEntryPageSchema,
  Folder: folderSchema,
  ChatMessage: chatMessageSchema,
  ...SCENE_DOCUMENT_SCHEMAS,
});

export const userUpdateSchema = z
  .object({
    _id: documentIdSchema,
    color: colorSchema.optional(),
    avatar: filePathSchema.nullable().optional(),
    character: documentIdSchema.nullable().optional(),
    flags: objectRecordSchema.optional(),
  })
  .strict();
