import type { PlainObject } from "@tabbletop/common";
import {
  ArrayField,
  BooleanField,
  ColorField,
  DocumentFlagsField,
  DocumentIdField,
  DocumentOwnershipField,
  DocumentStatsField,
  DocumentTypeField,
  EmbeddedCollectionField,
  FilePathField,
  ForeignDocumentField,
  HTMLField,
  IntegerSortField,
  JSONField,
  NumberField,
  ObjectField,
  SchemaField,
  SetField,
  StringField,
  TypeDataField,
  type FieldRecord,
} from "../data/fields";
import { Document, type DocumentMetadata } from "./abstract/Document";

function documentMetadata(overrides: Partial<DocumentMetadata> & Pick<DocumentMetadata, "name">): DocumentMetadata {
  return Object.freeze({
    collection: null,
    label: `DOCUMENT.${overrides.name}`,
    labelPlural: `DOCUMENT.${overrides.name}s`,
    embedded: {},
    hasTypeData: false,
    indexed: false,
    compendiumIndexFields: ["_id", "name", "sort", "folder"],
    permissions: { create: "ASSISTANT", update: "OWNER", delete: "ASSISTANT" },
    schemaVersion: "13.341",
    ...overrides,
  }) as DocumentMetadata;
}

function defaultArtwork(documentClass: typeof Document) {
  return (data?: PlainObject) => (documentClass.implementation as any)?.getDefaultArtwork?.(data ?? {})?.img ?? null;
}

const metadataFields = (): FieldRecord => ({
  sort: new IntegerSortField(),
  flags: new DocumentFlagsField(),
  _stats: new DocumentStatsField(),
});

export class BaseActiveEffect extends Document {
  static override metadata = documentMetadata({ name: "ActiveEffect", collection: "effects", hasTypeData: true, permissions: { create: "OWNER", update: "OWNER", delete: "OWNER" } });
  static override DEFAULT_ICON = "icons/svg/aura.svg";

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      img: new FilePathField({ initial: defaultArtwork(this) }),
      type: new DocumentTypeField(this, { initial: "base" }),
      system: new TypeDataField(this),
      changes: new ArrayField(
        new SchemaField({
          key: new StringField({ required: true }),
          value: new StringField({ required: true }),
          mode: new NumberField({ integer: true, initial: 2, nullable: false }),
          priority: new NumberField(),
        }),
      ),
      disabled: new BooleanField(),
      duration: new ObjectField(),
      description: new HTMLField(),
      origin: new StringField({ nullable: true, blank: false, initial: null }),
      tint: new ColorField({ nullable: false, initial: "#ffffff" }),
      transfer: new BooleanField({ initial: true }),
      statuses: new SetField(new StringField({ required: true, blank: false })),
      ...metadataFields(),
    };
  }

  static getDefaultArtwork(_data: PlainObject): { img: string | null } {
    return { img: this.DEFAULT_ICON };
  }
}

export class BaseItem extends Document {
  static override metadata = documentMetadata({
    name: "Item",
    collection: "items",
    embedded: { ActiveEffect: "effects" },
    hasTypeData: true,
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "type", "sort", "folder"],
    permissions: { create: "ITEM_CREATE", update: "OWNER", delete: "OWNER" },
  });
  static override DEFAULT_ICON = "icons/svg/item-bag.svg";

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      type: new DocumentTypeField(this),
      img: new FilePathField({ initial: defaultArtwork(this) }),
      system: new TypeDataField(this),
      effects: new EmbeddedCollectionField(BaseActiveEffect as any),
      folder: new ForeignDocumentField("Folder"),
      ownership: new DocumentOwnershipField(),
      ...metadataFields(),
    };
  }

  static getDefaultArtwork(_data: PlainObject): { img: string | null } {
    return { img: this.DEFAULT_ICON };
  }
}

export class BaseActor extends Document {
  static override metadata = documentMetadata({
    name: "Actor",
    collection: "actors",
    embedded: { ActiveEffect: "effects", Item: "items" },
    hasTypeData: true,
    indexed: true,
    compendiumIndexFields: ["_id", "name", "img", "type", "sort", "folder"],
    permissions: { create: "ACTOR_CREATE", update: "OWNER", delete: "OWNER" },
  });
  static override DEFAULT_ICON = "icons/svg/mystery-man.svg";

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      img: new FilePathField({ initial: defaultArtwork(this) }),
      type: new DocumentTypeField(this),
      system: new TypeDataField(this),
      prototypeToken: new ObjectField(),
      items: new EmbeddedCollectionField(BaseItem as any),
      effects: new EmbeddedCollectionField(BaseActiveEffect as any),
      folder: new ForeignDocumentField("Folder"),
      ownership: new DocumentOwnershipField(),
      ...metadataFields(),
    };
  }

  static getDefaultArtwork(_data: PlainObject): { img: string | null } {
    return { img: this.DEFAULT_ICON };
  }
}

export class BaseJournalEntryPage extends Document {
  static override metadata = documentMetadata({ name: "JournalEntryPage", collection: "pages", hasTypeData: true, permissions: { create: "OWNER", update: "OWNER", delete: "OWNER" } });

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      type: new DocumentTypeField(this, { initial: "text" }),
      system: new TypeDataField(this),
      title: new SchemaField({ show: new BooleanField({ initial: true }), level: new NumberField({ integer: true, initial: 1, min: 1, max: 6, nullable: false }) }),
      image: new SchemaField({ caption: new StringField() }),
      text: new SchemaField({
        content: new HTMLField({ required: false, nullable: true, initial: null }),
        markdown: new StringField(),
        format: new NumberField({ integer: true, initial: 1, nullable: false }),
      }),
      video: new ObjectField(),
      src: new StringField({ nullable: true, blank: false, initial: null }),
      category: new DocumentIdField({ readonly: false }),
      ownership: new DocumentOwnershipField({ initial: () => ({ default: -1 }) }),
      ...metadataFields(),
    };
  }
}

export class BaseJournalEntry extends Document {
  static override metadata = documentMetadata({
    name: "JournalEntry",
    collection: "journal",
    embedded: { JournalEntryPage: "pages" },
    indexed: true,
    permissions: { create: "JOURNAL_CREATE", update: "OWNER", delete: "OWNER" },
  });
  static override DEFAULT_ICON = "icons/svg/book.svg";

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      pages: new EmbeddedCollectionField(BaseJournalEntryPage as any),
      folder: new ForeignDocumentField("Folder"),
      categories: new ArrayField(new ObjectField()),
      ownership: new DocumentOwnershipField(),
      ...metadataFields(),
    };
  }
}

export class BaseFolder extends Document {
  static override metadata = documentMetadata({ name: "Folder", collection: "folders" });

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false, textSearch: true }),
      type: new StringField({ required: true, choices: ["Actor", "Item", "JournalEntry", "Scene", "Macro", "Playlist", "RollTable", "Cards", "Adventure", "Compendium"] }),
      description: new HTMLField(),
      folder: new ForeignDocumentField("Folder"),
      sorting: new StringField({ initial: "a", choices: ["a", "m"] }),
      color: new ColorField(),
      ...metadataFields(),
    };
  }
}

export class BaseChatMessage extends Document {
  static override metadata = documentMetadata({
    name: "ChatMessage",
    collection: "messages",
    label: "DOCUMENT.ChatMessage",
    labelPlural: "DOCUMENT.ChatMessages",
    permissions: { create: "NONE", update: "OWNER", delete: "OWNER" },
  });

  static override defineSchema(): FieldRecord {
    const currentUserId = () => (globalThis as any).game?.user?.id ?? null;
    return {
      _id: new DocumentIdField(),
      type: new StringField({ required: true, blank: false, initial: "base" }),
      system: new ObjectField(),
      style: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
      author: new ForeignDocumentField("User", { nullable: false, initial: currentUserId }),
      timestamp: new NumberField({ required: true, nullable: false, initial: () => Date.now() }),
      flavor: new HTMLField(),
      content: new HTMLField(),
      speaker: new SchemaField({
        scene: new ForeignDocumentField("Scene", { idOnly: true }),
        actor: new ForeignDocumentField("Actor", { idOnly: true }),
        token: new ForeignDocumentField("Token", { idOnly: true }),
        alias: new StringField(),
      }),
      whisper: new ArrayField(new ForeignDocumentField("User", { idOnly: true })),
      blind: new BooleanField(),
      rolls: new ArrayField(new JSONField()),
      sound: new FilePathField(),
      emote: new BooleanField(),
      flags: new DocumentFlagsField(),
      _stats: new DocumentStatsField(),
    };
  }
}

export class BaseCombatant extends Document {
  static override metadata = documentMetadata({ name: "Combatant", collection: "combatants", hasTypeData: true, permissions: { create: "OWNER", update: "OWNER", delete: "OWNER" } });

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      type: new DocumentTypeField(this, { initial: "base" }),
      system: new TypeDataField(this),
      actorId: new ForeignDocumentField("Actor", { idOnly: true }),
      tokenId: new ForeignDocumentField("Token", { idOnly: true }),
      sceneId: new ForeignDocumentField("Scene", { idOnly: true }),
      name: new StringField(),
      img: new FilePathField(),
      initiative: new NumberField(),
      hidden: new BooleanField(),
      defeated: new BooleanField(),
      ...metadataFields(),
    };
  }
}

export class BaseCombat extends Document {
  static override metadata = documentMetadata({ name: "Combat", collection: "combats", embedded: { Combatant: "combatants" }, hasTypeData: true, permissions: { create: "ASSISTANT", update: "OWNER", delete: "ASSISTANT" } });

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      type: new DocumentTypeField(this, { initial: "base" }),
      system: new TypeDataField(this),
      scene: new ForeignDocumentField("Scene"),
      combatants: new EmbeddedCollectionField(BaseCombatant as any),
      active: new BooleanField(),
      round: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      turn: new NumberField({ integer: true, min: 0, initial: null }),
      currentCombatantId: new StringField({ nullable: true, initial: null, blank: false }),
      started: new BooleanField(),
      ...metadataFields(),
    };
  }
}

export class BaseUser extends Document {
  static override metadata = documentMetadata({ name: "User", collection: "users", permissions: { create: "ASSISTANT", update: "OWNER", delete: "ASSISTANT" } });

  static override defineSchema(): FieldRecord {
    return {
      _id: new DocumentIdField(),
      name: new StringField({ required: true, blank: false }),
      role: new NumberField({ required: true, integer: true, min: 0, max: 4, initial: 1, nullable: false }),
      avatar: new FilePathField(),
      character: new ForeignDocumentField("Actor"),
      color: new ColorField({ required: true }),
      pronouns: new StringField(),
      hotbar: new ObjectField(),
      permissions: new ObjectField(),
      flags: new DocumentFlagsField(),
      _stats: new DocumentStatsField(),
    };
  }
}
