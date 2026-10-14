import {
  AlphaField,
  AngleField,
  ArrayField,
  BooleanField,
  ColorField,
  DocumentFlagsField,
  DocumentIdField,
  DocumentOwnershipField,
  DocumentStatsField,
  EmbeddedCollectionField,
  FilePathField,
  ForeignDocumentField,
  IntegerSortField,
  NumberField,
  ObjectField,
  SchemaField,
  StringField,
  type FieldRecord,
} from "../data/fields";
import { Document, type DocumentMetadata } from "./abstract/Document";

const GM_ONLY = { create: "ASSISTANT", update: "OWNER", delete: "ASSISTANT" } as const;

function placeableMetadata(name: string, collection: string, permissions: DocumentMetadata["permissions"] = { create: "ASSISTANT", update: "OWNER", delete: "OWNER" }): DocumentMetadata {
  return Object.freeze({
    name,
    collection,
    label: `DOCUMENT.${name}`,
    labelPlural: `DOCUMENT.${name}s`,
    embedded: {},
    hasTypeData: false,
    indexed: false,
    compendiumIndexFields: ["_id"],
    permissions,
    schemaVersion: "13.341",
    isEmbedded: true,
  }) as DocumentMetadata;
}

const number = (initial: number, options: Record<string, unknown> = {}) => new NumberField({ required: true, nullable: false, initial, ...options });

function textureField(initialSrc: string | null = null): SchemaField {
  return new SchemaField({
    src: new FilePathField({ initial: initialSrc }),
    anchorX: number(0.5),
    anchorY: number(0.5),
    offsetX: number(0),
    offsetY: number(0),
    fit: new StringField({ initial: "contain", choices: ["fill", "contain", "cover", "width", "height"] }),
    scaleX: number(1),
    scaleY: number(1),
    rotation: new AngleField(),
    tint: new ColorField({ nullable: false, initial: "#ffffff" }),
    alphaThreshold: new AlphaField({ initial: 0.75 }),
  });
}

function lightField(): SchemaField {
  return new SchemaField({
    dim: number(0, { min: 0 }),
    bright: number(0, { min: 0 }),
    angle: new AngleField({ initial: 360, max: 360 }),
    color: new ColorField(),
    alpha: new AlphaField({ initial: 0.5 }),
    luminosity: number(0.5, { min: -1, max: 1 }),
  });
}

const placeableFields = (): FieldRecord => ({
  x: number(0),
  y: number(0),
  elevation: number(0),
  sort: new IntegerSortField(),
  flags: new DocumentFlagsField(),
  _stats: new DocumentStatsField(),
});

export class BaseToken extends Document {
  static override metadata = placeableMetadata("Token", "tokens", { create: "TOKEN_CREATE", update: "OWNER", delete: "TOKEN_DELETE" });
  static override DEFAULT_ICON = "icons/svg/mystery-man.svg";

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: true, textSearch: true }),
      displayName: number(0, { integer: true }),
      actorId: new ForeignDocumentField("Actor", { idOnly: true }),
      actorLink: new BooleanField(),
      delta: new ObjectField(),
      width: number(1, { positive: true }),
      height: number(1, { positive: true }),
      texture: textureField(BaseToken.DEFAULT_ICON),
      shape: number(0, { integer: true }),
      locked: new BooleanField(),
      lockRotation: new BooleanField(),
      rotation: new AngleField(),
      alpha: new AlphaField(),
      hidden: new BooleanField(),
      disposition: number(-1, { integer: true, min: -2, max: 1 }),
      displayBars: number(0, { integer: true }),
      bar1: new SchemaField({ attribute: new StringField({ nullable: true, blank: false, initial: null }) }),
      bar2: new SchemaField({ attribute: new StringField({ nullable: true, blank: false, initial: null }) }),
      light: lightField(),
      sight: new SchemaField({
        enabled: new BooleanField(),
        range: number(0, { min: 0 }),
        angle: new AngleField({ initial: 360, max: 360 }),
        visionMode: new StringField({ initial: "basic" }),
        color: new ColorField(),
      }),
      detectionModes: new ArrayField(new ObjectField()),
      occludable: new ObjectField(),
      ring: new ObjectField(),
      turnMarker: new ObjectField(),
      movementAction: new StringField({ nullable: true, initial: null }),
      ...placeableFields(),
    };
  }
}

export class BaseTile extends Document {
  static override metadata = placeableMetadata("Tile", "tiles");

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      texture: textureField(),
      width: number(100, { positive: true }),
      height: number(100, { positive: true }),
      rotation: new AngleField(),
      alpha: new AlphaField(),
      hidden: new BooleanField(),
      locked: new BooleanField(),
      restrictions: new ObjectField(),
      occlusion: new ObjectField(),
      video: new ObjectField(),
      ...placeableFields(),
    };
  }
}

export class BaseWall extends Document {
  static override metadata = placeableMetadata("Wall", "walls");

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      c: new ArrayField(new NumberField({ required: true, nullable: false })),
      light: number(20, { integer: true }),
      move: number(20, { integer: true }),
      sight: number(20, { integer: true }),
      sound: number(20, { integer: true }),
      dir: number(0, { integer: true }),
      door: number(0, { integer: true }),
      ds: number(0, { integer: true }),
      doorSound: new StringField(),
      threshold: new ObjectField(),
      animation: new ObjectField({ nullable: true, initial: null }),
      flags: new DocumentFlagsField(),
      _stats: new DocumentStatsField(),
    };
  }
}

export class BaseAmbientLight extends Document {
  static override metadata = placeableMetadata("AmbientLight", "lights");

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      rotation: new AngleField(),
      walls: new BooleanField({ initial: true }),
      vision: new BooleanField(),
      config: lightField(),
      hidden: new BooleanField(),
      ...placeableFields(),
    };
  }
}

export class BaseNote extends Document {
  static override metadata = placeableMetadata("Note", "notes", { create: "NOTE_CREATE", update: "OWNER", delete: "OWNER" });
  static override DEFAULT_ICON = "icons/svg/book.svg";

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      entryId: new ForeignDocumentField("JournalEntry", { idOnly: true }),
      pageId: new DocumentIdField({ readonly: false }),
      texture: textureField(BaseNote.DEFAULT_ICON),
      iconSize: number(40, { integer: true, min: 8 }),
      text: new StringField(),
      fontFamily: new StringField({ initial: "Arial" }),
      fontSize: number(32, { integer: true }),
      textAnchor: number(1, { integer: true }),
      textColor: new ColorField({ nullable: false, initial: "#ffffff" }),
      global: new BooleanField(),
      ...placeableFields(),
    };
  }
}

export class BaseDrawing extends Document {
  static override metadata = placeableMetadata("Drawing", "drawings", { create: "DRAWING_CREATE", update: "OWNER", delete: "OWNER" });

  static override defineSchema(): FieldRecord {
    const currentUserId = () => (globalThis as any).game?.user?.id ?? null;
    return {
      _id: new DocumentIdField(),
      author: new ForeignDocumentField("User", { nullable: false, initial: currentUserId }),
      shape: new SchemaField({
        type: new StringField({ initial: "r", choices: ["r", "e", "t", "p", "c"] }),
        width: new NumberField(),
        height: new NumberField(),
        radius: new NumberField(),
        points: new ArrayField(new NumberField({ nullable: false })),
      }),
      rotation: new AngleField(),
      bezierFactor: number(0, { min: 0, max: 0.5 }),
      fillType: number(0, { integer: true }),
      fillColor: new ColorField({ nullable: false, initial: "#ffffff" }),
      fillAlpha: new AlphaField({ initial: 0.5 }),
      strokeWidth: number(8, { integer: true, min: 0 }),
      strokeColor: new ColorField({ nullable: false, initial: "#ffffff" }),
      strokeAlpha: new AlphaField(),
      texture: new FilePathField(),
      text: new StringField(),
      fontFamily: new StringField({ initial: "Arial" }),
      fontSize: number(48, { integer: true }),
      textColor: new ColorField({ nullable: false, initial: "#ffffff" }),
      textAlpha: new AlphaField(),
      hidden: new BooleanField(),
      locked: new BooleanField(),
      interface: new BooleanField(),
      ...placeableFields(),
    };
  }
}

export class BaseMeasuredTemplate extends Document {
  static override metadata = placeableMetadata("MeasuredTemplate", "templates", { create: "TEMPLATE_CREATE", update: "OWNER", delete: "OWNER" });

  static override defineSchema(): FieldRecord {
    const currentUserId = () => (globalThis as any).game?.user?.id ?? null;
    return {
      _id: new DocumentIdField(),
      author: new ForeignDocumentField("User", { nullable: false, initial: currentUserId }),
      t: new StringField({ initial: "circle", choices: ["circle", "cone", "rect", "ray"] }),
      distance: number(5, { min: 0 }),
      direction: number(0),
      angle: number(53.13, { min: 0, max: 360 }),
      width: number(1, { min: 0 }),
      borderColor: new ColorField({ nullable: false, initial: "#000000" }),
      fillColor: new ColorField({ nullable: false, initial: "#ff6400" }),
      texture: new FilePathField(),
      hidden: new BooleanField(),
      ...placeableFields(),
    };
  }
}

export class BaseScene extends Document {
  static override metadata = Object.freeze({
    name: "Scene",
    collection: "scenes",
    label: "DOCUMENT.Scene",
    labelPlural: "DOCUMENT.Scenes",
    embedded: { Token: "tokens", Tile: "tiles", Wall: "walls", AmbientLight: "lights", Note: "notes", Drawing: "drawings", MeasuredTemplate: "templates" },
    hasTypeData: false,
    indexed: true,
    compendiumIndexFields: ["_id", "name", "thumb", "sort", "folder"],
    permissions: GM_ONLY,
    schemaVersion: "13.341",
  }) as DocumentMetadata;

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      active: new BooleanField(),
      navigation: new BooleanField({ initial: true }),
      navOrder: number(0, { integer: true }),
      navName: new StringField(),
      background: new SchemaField({ src: new FilePathField(), tint: new ColorField({ nullable: false, initial: "#ffffff" }) }),
      foreground: new FilePathField(),
      foregroundElevation: new NumberField(),
      thumb: new FilePathField(),
      width: number(4000, { integer: true, min: 100 }),
      height: number(3000, { integer: true, min: 100 }),
      padding: number(0.25, { min: 0, max: 0.5 }),
      initial: new ObjectField({ nullable: true, initial: null }),
      backgroundColor: new ColorField({ nullable: false, initial: "#999999" }),
      grid: new SchemaField({
        type: number(1, { integer: true }),
        size: number(100, { integer: true, min: 20 }),
        style: new StringField({ initial: "solidLines" }),
        thickness: number(1, { integer: true }),
        color: new ColorField({ nullable: false, initial: "#000000" }),
        alpha: new AlphaField({ initial: 0.2 }),
        distance: number(1.5, { positive: true }),
        units: new StringField({ initial: "m" }),
      }),
      tokenVision: new BooleanField({ initial: true }),
      fog: new SchemaField({ exploration: new BooleanField({ initial: true }), reset: new NumberField() }),
      environment: new SchemaField({ darknessLevel: new AlphaField({ initial: 0 }), globalLight: new ObjectField() }),
      tokens: new EmbeddedCollectionField(BaseToken as any),
      tiles: new EmbeddedCollectionField(BaseTile as any),
      walls: new EmbeddedCollectionField(BaseWall as any),
      lights: new EmbeddedCollectionField(BaseAmbientLight as any),
      notes: new EmbeddedCollectionField(BaseNote as any),
      drawings: new EmbeddedCollectionField(BaseDrawing as any),
      templates: new EmbeddedCollectionField(BaseMeasuredTemplate as any),
      sounds: new ArrayField(new ObjectField()),
      regions: new ArrayField(new ObjectField()),
      playlist: new ForeignDocumentField("Playlist", { idOnly: true }),
      journal: new ForeignDocumentField("JournalEntry", { idOnly: true }),
      weather: new StringField(),
      folder: new ForeignDocumentField("Folder"),
      ownership: new DocumentOwnershipField(),
      sort: new IntegerSortField(),
      flags: new DocumentFlagsField(),
      _stats: new DocumentStatsField(),
    };
  }
}
