import { z } from "zod";
import { colorSchema, documentIdSchema, filePathSchema, objectRecordSchema, ownershipSchema } from "./schemaPrimitives";

/** Canvas coordinates stay within a sane range so a crafted value cannot blow up rendering math. */
const coordinateSchema = z.number().min(-1_000_000).max(1_000_000);
const unitIntervalSchema = z.number().min(0).max(1);
const angleSchema = z.number().min(-3600).max(3600);
const shortTextSchema = z.string().max(256);

const placeableFields = {
  _id: documentIdSchema.nullish(),
  flags: objectRecordSchema.default({}),
  _stats: objectRecordSchema.default({}),
  sort: z.number().int().default(0),
  x: coordinateSchema.default(0),
  y: coordinateSchema.default(0),
  elevation: z.number().min(-100_000).max(100_000).default(0),
};

const textureSchema = z
  .looseObject({
    src: filePathSchema.nullable().default(null),
    tint: colorSchema.default("#ffffff"),
    scaleX: z.number().min(-20).max(20).default(1),
    scaleY: z.number().min(-20).max(20).default(1),
    offsetX: z.number().min(-10_000).max(10_000).default(0),
    offsetY: z.number().min(-10_000).max(10_000).default(0),
    rotation: angleSchema.default(0),
    anchorX: z.number().min(-10).max(10).default(0.5),
    anchorY: z.number().min(-10).max(10).default(0.5),
    fit: z.enum(["fill", "contain", "cover", "width", "height"]).default("contain"),
    alphaThreshold: unitIntervalSchema.default(0.75),
  })
  .default({ src: null, tint: "#ffffff", scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, rotation: 0, anchorX: 0.5, anchorY: 0.5, fit: "contain", alphaThreshold: 0.75 });

const lightDataSchema = z
  .looseObject({
    dim: z.number().min(0).max(1000).default(0),
    bright: z.number().min(0).max(1000).default(0),
    angle: z.number().min(0).max(360).default(360),
    color: colorSchema.nullable().default(null),
    alpha: unitIntervalSchema.default(0.5),
    luminosity: z.number().min(-1).max(1).default(0.5),
  })
  .default({ dim: 0, bright: 0, angle: 360, color: null, alpha: 0.5, luminosity: 0.5 });

const sightSchema = z
  .looseObject({
    enabled: z.boolean().default(false),
    range: z.number().min(0).max(1000).default(0),
    angle: z.number().min(0).max(360).default(360),
    visionMode: shortTextSchema.default("basic"),
    color: colorSchema.nullable().default(null),
  })
  .default({ enabled: false, range: 0, angle: 360, visionMode: "basic", color: null });

const barSchema = z.looseObject({ attribute: z.string().max(256).nullable().default(null) }).default({ attribute: null });

export const tokenSchema = z.object({
  ...placeableFields,
  name: z.string().max(256).default(""),
  displayName: z.number().int().min(0).max(50).default(0),
  actorId: documentIdSchema.nullable().default(null),
  actorLink: z.boolean().default(false),
  delta: objectRecordSchema.default({}),
  width: z.number().min(0.1).max(50).default(1),
  height: z.number().min(0.1).max(50).default(1),
  texture: textureSchema,
  shape: z.number().int().min(0).max(10).default(0),
  locked: z.boolean().default(false),
  lockRotation: z.boolean().default(false),
  rotation: angleSchema.default(0),
  alpha: unitIntervalSchema.default(1),
  hidden: z.boolean().default(false),
  disposition: z.number().int().min(-2).max(1).default(-1),
  displayBars: z.number().int().min(0).max(50).default(0),
  bar1: barSchema,
  bar2: barSchema,
  light: lightDataSchema,
  sight: sightSchema,
  detectionModes: z.array(objectRecordSchema).max(20).default([]),
  occludable: objectRecordSchema.default({}),
  ring: objectRecordSchema.default({}),
  turnMarker: objectRecordSchema.default({}),
  movementAction: z.string().max(64).nullable().default(null),
});

export const tileSchema = z.object({
  ...placeableFields,
  texture: textureSchema,
  width: z.number().min(1).max(100_000).default(100),
  height: z.number().min(1).max(100_000).default(100),
  rotation: angleSchema.default(0),
  alpha: unitIntervalSchema.default(1),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  restrictions: objectRecordSchema.default({}),
  occlusion: objectRecordSchema.default({}),
  video: objectRecordSchema.default({}),
});

export const wallSchema = z.object({
  _id: documentIdSchema.nullish(),
  flags: objectRecordSchema.default({}),
  _stats: objectRecordSchema.default({}),
  c: z.tuple([coordinateSchema, coordinateSchema, coordinateSchema, coordinateSchema]),
  light: z.number().int().min(0).max(50).default(20),
  move: z.number().int().min(0).max(50).default(20),
  sight: z.number().int().min(0).max(50).default(20),
  sound: z.number().int().min(0).max(50).default(20),
  dir: z.number().int().min(0).max(2).default(0),
  door: z.number().int().min(0).max(2).default(0),
  ds: z.number().int().min(0).max(2).default(0),
  doorSound: shortTextSchema.optional(),
  threshold: objectRecordSchema.default({}),
  animation: objectRecordSchema.nullable().default(null),
});

export const ambientLightSchema = z.object({
  ...placeableFields,
  rotation: angleSchema.default(0),
  walls: z.boolean().default(true),
  vision: z.boolean().default(false),
  config: lightDataSchema,
  hidden: z.boolean().default(false),
});

export const noteSchema = z.object({
  ...placeableFields,
  entryId: documentIdSchema.nullable().default(null),
  pageId: documentIdSchema.nullable().default(null),
  texture: textureSchema,
  iconSize: z.number().int().min(8).max(512).default(40),
  text: z.string().max(1000).default(""),
  fontFamily: shortTextSchema.default("Arial"),
  fontSize: z.number().int().min(8).max(256).default(32),
  textAnchor: z.number().int().min(0).max(4).default(1),
  textColor: colorSchema.default("#ffffff"),
  global: z.boolean().default(false),
});

const drawingShapeSchema = z.object({
  type: z.enum(["r", "e", "t", "p", "c"]).default("r"),
  width: z.number().min(0).max(100_000).nullable().default(null),
  height: z.number().min(0).max(100_000).nullable().default(null),
  radius: z.number().min(0).max(100_000).nullable().default(null),
  points: z.array(coordinateSchema).max(20_000).default([]),
});

export const drawingSchema = z.object({
  ...placeableFields,
  author: documentIdSchema.nullable().default(null),
  shape: drawingShapeSchema.default({ type: "r", width: null, height: null, radius: null, points: [] }),
  rotation: angleSchema.default(0),
  bezierFactor: z.number().min(0).max(0.5).default(0),
  fillType: z.number().int().min(0).max(2).default(0),
  fillColor: colorSchema.default("#ffffff"),
  fillAlpha: unitIntervalSchema.default(0.5),
  strokeWidth: z.number().int().min(0).max(100).default(8),
  strokeColor: colorSchema.default("#ffffff"),
  strokeAlpha: unitIntervalSchema.default(1),
  texture: filePathSchema.nullable().default(null),
  text: z.string().max(5000).default(""),
  fontFamily: shortTextSchema.default("Arial"),
  fontSize: z.number().int().min(8).max(256).default(48),
  textColor: colorSchema.default("#ffffff"),
  textAlpha: unitIntervalSchema.default(1),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  interface: z.boolean().default(false),
  editors: z.array(documentIdSchema).max(64).default([]),
});

export const measuredTemplateSchema = z.object({
  ...placeableFields,
  author: documentIdSchema.nullable().default(null),
  t: z.enum(["circle", "cone", "rect", "ray"]).default("circle"),
  distance: z.number().min(0).max(10_000).default(5),
  direction: angleSchema.default(0),
  angle: z.number().min(0).max(360).default(53.13),
  width: z.number().min(0).max(10_000).default(1),
  borderColor: colorSchema.default("#000000"),
  fillColor: colorSchema.default("#ff6400"),
  texture: filePathSchema.nullable().default(null),
  hidden: z.boolean().default(false),
});

const gridSchema = z
  .object({
    type: z.number().int().min(0).max(5).default(1),
    size: z.number().int().min(20).max(1000).default(100),
    style: shortTextSchema.default("solidLines"),
    thickness: z.number().int().min(1).max(20).default(1),
    color: colorSchema.default("#000000"),
    alpha: unitIntervalSchema.default(0.2),
    distance: z.number().min(0.01).max(10_000).default(1.5),
    units: z.string().max(32).default("m"),
  })
  .default({ type: 1, size: 100, style: "solidLines", thickness: 1, color: "#000000", alpha: 0.2, distance: 1.5, units: "m" });

export const sceneSchema = z.object({
  _id: documentIdSchema.nullish(),
  flags: objectRecordSchema.default({}),
  _stats: objectRecordSchema.default({}),
  sort: z.number().int().default(0),
  name: z.string().trim().min(1).max(256),
  active: z.boolean().default(false),
  navigation: z.boolean().default(true),
  navOrder: z.number().int().default(0),
  navName: z.string().max(256).default(""),
  background: z.looseObject({ src: filePathSchema.nullable().default(null), tint: colorSchema.default("#ffffff") }).default({ src: null, tint: "#ffffff" }),
  foreground: filePathSchema.nullable().default(null),
  foregroundElevation: z.number().nullable().default(null),
  thumb: filePathSchema.nullable().default(null),
  width: z.number().int().min(100).max(30_000).default(4000),
  height: z.number().int().min(100).max(30_000).default(3000),
  padding: z.number().min(0).max(0.5).default(0.25),
  initial: z.object({ x: coordinateSchema.nullish(), y: coordinateSchema.nullish(), scale: z.number().min(0.1).max(5).nullish() }).nullable().default(null),
  backgroundColor: colorSchema.default("#999999"),
  grid: gridSchema,
  tokenVision: z.boolean().default(true),
  fog: z.looseObject({ exploration: z.boolean().default(true), reset: z.number().nullish() }).default({ exploration: true }),
  environment: z.looseObject({ darknessLevel: unitIntervalSchema.default(0), globalLight: objectRecordSchema.default({}) }).default({ darknessLevel: 0, globalLight: {} }),
  tokens: z.array(tokenSchema).max(2000).default([]),
  tiles: z.array(tileSchema).max(2000).default([]),
  walls: z.array(wallSchema).max(10_000).default([]),
  lights: z.array(ambientLightSchema).max(2000).default([]),
  notes: z.array(noteSchema).max(2000).default([]),
  drawings: z.array(drawingSchema).max(5000).default([]),
  templates: z.array(measuredTemplateSchema).max(2000).default([]),
  sounds: z.array(objectRecordSchema).max(1000).default([]),
  regions: z.array(objectRecordSchema).max(1000).default([]),
  playlist: documentIdSchema.nullable().default(null),
  journal: documentIdSchema.nullable().default(null),
  weather: z.string().max(64).default(""),
  folder: documentIdSchema.nullable().default(null),
  ownership: ownershipSchema.default({ default: 0 }),
});

export const SCENE_DOCUMENT_SCHEMAS = {
  Scene: sceneSchema,
  Token: tokenSchema,
  Tile: tileSchema,
  Wall: wallSchema,
  AmbientLight: ambientLightSchema,
  Note: noteSchema,
  Drawing: drawingSchema,
  MeasuredTemplate: measuredTemplateSchema,
} as const;
