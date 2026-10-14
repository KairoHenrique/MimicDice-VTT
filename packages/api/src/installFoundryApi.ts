import Handlebars from "handlebars";
import jQuery from "jquery";
import { ApplicationV2 } from "./applications/ApplicationV2";
import { applicationInstances } from "./applications/applicationRegistry";
import { FilePicker } from "./applications/apps/FilePicker";
import { defineFormElements, HTMLFilePickerElement, HTMLProseMirrorElement, HTMLStringTagsElement } from "./applications/elements/formElements";
import { DragDrop } from "./applications/ux/DragDrop";
import { ContextMenu } from "./applications/ux/ContextMenu";
import { ImagePopout } from "./applications/apps/ImagePopout";
import { Compendium, CompendiumCollection, MacroConfig, TokenHUD } from "./applications/compatClasses";
import { ForcedDeletion, ForcedReplacement } from "./data/operators";
import { KeyboardManager } from "./game/KeyboardManager";
import { ImageHelper, VideoHelper } from "./helpers/media";
import { TooltipManager } from "./helpers/TooltipManager";
import { TextEditor } from "./applications/ux/TextEditor";
import { ActiveEffectConfig } from "./documents/ActiveEffectConfig";
import { DialogV2 } from "./applications/DialogV2";
import { FormDataExtended } from "./applications/FormDataExtended";
import { HandlebarsApplicationMixin } from "./applications/HandlebarsApplicationMixin";
import { Application } from "./appv1/Application";
import { Dialog } from "./appv1/Dialog";
import { FormApplication } from "./appv1/FormApplication";
import { DEFAULT_FONT_DEFINITIONS, FontConfig } from "./applications/settings/FontConfig";
import { SettingsConfig } from "./applications/settings/SettingsConfig";
import { AudioHelper } from "./audio/AudioHelper";
import { Sound } from "./audio/Sound";
import { Tour, ToursCollection } from "./nue/Tour";
import { readTextFromFile, saveDataToFile } from "./utils/fileTransfer";
import { compatibilityMonitor, probeApi } from "./compatibility/CompatibilityMonitor";
import { createConfig } from "./config";
import { CONST } from "./constants";
import { DataModel, TypeDataModel } from "./data/DataModel";
import * as fields from "./data/fields";
import { ClientDatabaseBackend, fromUuid, fromUuidSync } from "./documents/abstract/ClientDatabaseBackend";
import { ClientDocumentMixin } from "./documents/abstract/ClientDocumentMixin";
import { Document } from "./documents/abstract/Document";
import { DocumentSheetConfig } from "./documents/abstract/DocumentSheetConfig";
import { EmbeddedCollection } from "./documents/abstract/EmbeddedCollection";
import * as baseDocuments from "./documents/baseDocuments";
import { ChatMessage } from "./documents/ChatMessage";
import { ActiveEffect, Actor, Combat, Combatant, Folder, Item, JournalEntry, JournalEntryPage } from "./documents/clientDocuments";
import { Actors, DocumentCollection, Folders, Items, Journal, Messages, Scenes, WorldCollection } from "./documents/collections";
import * as sceneBaseDocuments from "./documents/sceneBaseDocuments";
import {
  AmbientLightDocument,
  CanvasDocumentMixin,
  DrawingDocument,
  MeasuredTemplateDocument,
  NoteDocument,
  Scene,
  TileDocument,
  TokenDocument,
  WallDocument,
} from "./documents/sceneClientDocuments";
import * as PIXI from "pixi.js";
import { Canvas, CANVAS_LAYER_CLASSES, createCanvasNamespace, PLACEABLE_CLASSES } from "./canvas";
import { ClockwiseSweepPolygon, Ray } from "./canvas/geometryClasses";
import { BaseSamplerShader } from "./canvas/rendering";
import { configureDice, createDiceNamespace, DICE_TERMS, MersenneTwister, Roll } from "./dice";
import { ActorSheet, ActorSheetV2, DocumentSheet, DocumentSheetV2, ItemSheet, ItemSheetV2, JournalSheet } from "./documents/sheets";
import { Game } from "./game/Game";
import { Keybindings } from "./game/Keybindings";
import { Module, System, World } from "./game/Package";
import { User, Users } from "./game/User";
import { registerFoundryHandlebarsHelpers } from "./handlebars/helpers";
import { getTemplate, loadTemplates, renderTemplate } from "./handlebars/templates";
import { Hooks } from "./hooks/Hooks";
import { Localization } from "./i18n/Localization";
import { currentConfig, defineGlobal, type UiNamespace } from "./runtime";
import { ClientSettings } from "./settings/ClientSettings";
import { Notifications } from "./ui/Notifications";
import { foundryUtils } from "./utils";
import { Collection } from "./utils/Collection";
import { installPrimitiveExtensions } from "./utils/primitives";

const SCENE_DOCUMENTS = {
  Scene,
  Token: TokenDocument,
  Tile: TileDocument,
  Wall: WallDocument,
  AmbientLight: AmbientLightDocument,
  Note: NoteDocument,
  Drawing: DrawingDocument,
  MeasuredTemplate: MeasuredTemplateDocument,
};
const CLIENT_DOCUMENTS = { Actor, Item, ActiveEffect, Combat, Combatant, JournalEntry, JournalEntryPage, Folder, User, ChatMessage, ...SCENE_DOCUMENTS };
const DOCUMENT_GLOBALS = {
  Actor,
  Item,
  ActiveEffect,
  Combat,
  Combatant,
  JournalEntry,
  JournalEntryPage,
  Folder,
  User,
  ChatMessage,
  Scene,
  TokenDocument,
  TileDocument,
  WallDocument,
  AmbientLightDocument,
  NoteDocument,
  DrawingDocument,
  MeasuredTemplateDocument,
};
const WORLD_COLLECTIONS = { Actors, Items, Journal, Folders, Users, Messages, Scenes };
const PLACEABLE_LAYERS: Record<string, unknown> = {
  Token: CANVAS_LAYER_CLASSES.TokenLayer,
  Tile: CANVAS_LAYER_CLASSES.TilesLayer,
  Wall: CANVAS_LAYER_CLASSES.WallsLayer,
  AmbientLight: CANVAS_LAYER_CLASSES.LightingLayer,
  Note: CANVAS_LAYER_CLASSES.NotesLayer,
  Drawing: CANVAS_LAYER_CLASSES.DrawingsLayer,
  MeasuredTemplate: CANVAS_LAYER_CLASSES.TemplateLayer,
};

function getDocumentClass(documentName: string): unknown {
  return currentConfig()?.[documentName]?.documentClass;
}

function configurePlaceables(config: Record<string, any>): void {
  for (const [documentName, objectClass] of Object.entries(PLACEABLE_CLASSES)) {
    config[documentName].objectClass = objectClass;
    config[documentName].layerClass = PLACEABLE_LAYERS[documentName];
  }
  config.Canvas = {
    ...(config.Canvas ?? {}),
    layers: Canvas.layers,
    polygonBackends: { sight: ClockwiseSweepPolygon, light: ClockwiseSweepPolygon, sound: ClockwiseSweepPolygon, move: ClockwiseSweepPolygon },
    darknessColor: 0x242448,
    maxZoom: 3,
    minZoom: 0.1,
  };
  config.canvasTextStyle = new PIXI.TextStyle({ fontFamily: "Signika, Arial, sans-serif", fontSize: 36, fill: "#ffffff", stroke: "#111111", strokeThickness: 4, align: "center", dropShadow: true, dropShadowColor: "#000000", dropShadowBlur: 4, dropShadowDistance: 0 });
  config.soundEffects = { ...(config.soundEffects ?? {}) };
  config.Token.ring = { shaderClass: BaseSamplerShader, ...(config.Token.ring ?? {}) };
  config.controlIcons = { ...(config.controlIcons ?? {}), defeated: "icons/svg/skull.svg", combat: "icons/svg/combat.svg", visibility: "icons/svg/cowled.svg" };
}

function configureDocumentClasses(config: Record<string, any>): void {
  const collectionsByDocument: Record<string, unknown> = { Actor: Actors, Item: Items, JournalEntry: Journal, Folder: Folders, User: Users, ChatMessage: Messages, Scene: Scenes };
  for (const [documentName, documentClass] of Object.entries(CLIENT_DOCUMENTS)) {
    config[documentName] = {
      sheetClasses: {},
      typeLabels: {},
      dataModels: {},
      typeIcons: {},
      ...(config[documentName] ?? {}),
      documentClass,
      collection: collectionsByDocument[documentName],
    };
  }
  config.Combat.initiative = { formula: null, decimals: 2, ...(config.Combat.initiative ?? {}) };
  const macroSheet = { id: "core.MacroConfig", cls: MacroConfig, label: "Macro", default: true, canConfigure: false, canBeDefault: true };
  config.Macro = { documentClass: null, sheetClasses: { chat: { "core.MacroConfig": { ...macroSheet } }, script: { "core.MacroConfig": { ...macroSheet } } }, typeLabels: {}, ...(config.Macro ?? {}) };
  config.ChatMessage.template = "templates/sidebar/chat-message.html";
  config.ChatMessage.sidebarIcon = "fa-solid fa-dice-d20";
  config.ChatMessage.batchSize = 100;
}

function createFoundryNamespace() {
  const handlebars = { getTemplate, loadTemplates, renderTemplate };
  return {
    CONST,
    Game,
    audio: { AudioHelper, Sound },
    nue: { Tour, ToursCollection },
    utils: { ...foundryUtils, fromUuid, fromUuidSync, readTextFromFile, saveDataToFile, getDocumentClass },
    abstract: { DataModel, TypeDataModel, Document, EmbeddedCollection, DocumentSocketInterface: ClientDatabaseBackend },
    data: { fields: { ...fields }, operators: { ForcedDeletion, ForcedReplacement } },
    documents: {
      ...baseDocuments,
      ...sceneBaseDocuments,
      ...DOCUMENT_GLOBALS,
      abstract: { ClientDocumentMixin, CanvasDocumentMixin },
      collections: { DocumentCollection, WorldCollection, CompendiumCollection, ...WORLD_COLLECTIONS },
    },
    packages: { BasePackage: Module, Module, System, World },
    helpers: {
      Hooks,
      ClientSettings,
      Localization,
      interaction: { ClientKeybindings: Keybindings, KeyboardManager, TooltipManager },
      media: { ImageHelper, VideoHelper },
    },
    applications: {
      instances: applicationInstances,
      api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2, DocumentSheetV2 },
      handlebars,
      ux: { FormDataExtended, TextEditor, DragDrop, ContextMenu },
      apps: { DocumentSheetConfig, FilePicker, ImagePopout },
      hud: { TokenHUD },
      elements: { HTMLFilePickerElement, HTMLProseMirrorElement, HTMLStringTagsElement },
      sheets: { ActorSheetV2, ItemSheetV2, ActiveEffectConfig, MacroConfig },
      sidebar: { apps: { Compendium }, tabs: {} },
      settings: { SettingsConfig, menus: { FontConfig } },
      ui: {},
    },
    appv1: {
      api: { Application, FormApplication, Dialog, DocumentSheet },
      sheets: { ActorSheet, ItemSheet, JournalSheet },
    },
    canvas: createCanvasNamespace(),
    dice: createDiceNamespace(),
  };
}

/** Installs the globals that Foundry v13 packages expect before any package script is evaluated. */
export function installFoundryApi(notifications: Notifications): { ui: UiNamespace } {
  installPrimitiveExtensions();
  registerFoundryHandlebarsHelpers();
  compatibilityMonitor.install();

  const ui: UiNamespace = { notifications, windows: {} };
  const config = createConfig();
  configureDocumentClasses(config);
  configurePlaceables(config);
  configureDice(config);
  config.fontDefinitions = { ...DEFAULT_FONT_DEFINITIONS, ...(config.fontDefinitions ?? {}) };
  config.defaultFontFamily ??= "Arial";
  config.ux = { ...(config.ux ?? {}), FilePicker, TextEditor, DragDrop, ContextMenu, TooltipManager };
  config.TextEditor = { enrichers: [], ...(config.TextEditor ?? {}) };
  defineFormElements();
  if (typeof document !== "undefined") {
    if (document.body) TextEditor.activateListeners();
    else document.addEventListener("DOMContentLoaded", () => TextEditor.activateListeners(), { once: true });
  }
  const globals: Record<string, unknown> = {
    foundry: createFoundryNamespace(),
    CONST,
    CONFIG: config,
    Hooks,
    Game,
    ui,
    Handlebars,
    $: jQuery,
    jQuery,
    Collection,
    Color: foundryUtils.Color,
    Application,
    FormApplication,
    Dialog,
    DocumentSheet,
    ActorSheet,
    ItemSheet,
    JournalSheet,
    DocumentSheetConfig,
    FormDataExtended,
    FilePicker,
    TextEditor,
    DragDrop,
    ContextMenu,
    ImagePopout,
    TooltipManager,
    Ray,
    ActiveEffectConfig,
    PIXI,
    ...DOCUMENT_GLOBALS,
    ...WORLD_COLLECTIONS,
    ...PLACEABLE_CLASSES,
    ...CANVAS_LAYER_CLASSES,
    ...DICE_TERMS,
    Roll,
    MersenneTwister,
    AudioHelper,
    Sound,
    Tour,
    FontConfig,
    SettingsConfig,
    fromUuid,
    fromUuidSync,
    getDocumentClass,
    getTemplate,
    loadTemplates,
    renderTemplate,
    mergeObject: foundryUtils.mergeObject,
    duplicate: foundryUtils.duplicate,
    deepClone: foundryUtils.deepClone,
    getProperty: foundryUtils.getProperty,
    setProperty: foundryUtils.setProperty,
    hasProperty: foundryUtils.hasProperty,
    expandObject: foundryUtils.expandObject,
    flattenObject: foundryUtils.flattenObject,
    isNewerVersion: foundryUtils.isNewerVersion,
    randomID: foundryUtils.randomID,
    debounce: foundryUtils.debounce,
    getType: foundryUtils.getType,
    isEmpty: foundryUtils.isEmpty,
    diffObject: foundryUtils.diffObject,
    tabbletop: Object.freeze({ compatibility: compatibilityMonitor, probeApi }),
  };
  for (const [name, value] of Object.entries(globals)) defineGlobal(name, value);
  return { ui };
}
