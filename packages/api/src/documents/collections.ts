import type { PlainObject } from "@tabbletop/common";
import { currentCanvas, currentConfig, currentGame, currentUi } from "../runtime";
import { Collection } from "../utils/Collection";
import { DocumentSheetConfig } from "./abstract/DocumentSheetConfig";

const DIRECTORY_NAMES: Record<string, string> = { Actor: "actors", Item: "items", JournalEntry: "journal", Folder: "folders", User: "players", Scene: "scenes" };

export class DocumentCollection extends Collection<any> {
  static documentName = "Document";
  readonly apps: Array<{ render(force?: boolean, options?: object): unknown }> = [];

  get documentName(): string {
    return (this.constructor as typeof DocumentCollection).documentName;
  }

  get documentClass(): any {
    return currentConfig()?.[this.documentName]?.documentClass;
  }

  get name(): string {
    return this.constructor.name;
  }

  render(force = false, options: object = {}): void {
    for (const app of this.apps) void app.render(force, options);
  }

  async updateAll(transformation: PlainObject | ((document: any) => PlainObject), condition: ((document: any) => boolean) | null = null, options: object = {}): Promise<unknown[]> {
    const updates = this.filter((document) => !condition || condition(document)).map((document) => {
      const changes = typeof transformation === "function" ? transformation(document) : transformation;
      return { ...changes, _id: document.id };
    });
    return this.documentClass.updateDocuments(updates, options);
  }
}

export class WorldCollection extends DocumentCollection {
  get directory(): any {
    const directoryName = DIRECTORY_NAMES[this.documentName];
    return directoryName ? currentUi()?.[directoryName] : undefined;
  }

  /** Folders holding this collection's documents, as a keyed `Collection` (packages call `getName`, `get`, `contents`). */
  get folders(): Collection<any> {
    const folders = new Collection<any>();
    for (const folder of currentGame()?.folders?.values?.() ?? []) {
      if (folder.type === this.documentName) folders.set(folder.id, folder);
    }
    return folders;
  }

  static get instance(): WorldCollection | undefined {
    return currentGame()?.collections?.get(this.documentName);
  }

  static registerSheet(scope: string, sheetClass: any, options: object = {}): void {
    DocumentSheetConfig.registerSheet(currentConfig()[this.documentName].documentClass, scope, sheetClass, options);
  }

  static unregisterSheet(scope: string, sheetClass: any, options: object = {}): void {
    DocumentSheetConfig.unregisterSheet(currentConfig()[this.documentName].documentClass, scope, sheetClass, options);
  }

  static get registeredSheets(): any[] {
    const sheets = new Set<any>();
    for (const registrations of Object.values(currentConfig()?.[this.documentName]?.sheetClasses ?? {})) {
      for (const registration of Object.values(registrations as Record<string, { cls: unknown }>)) sheets.add(registration.cls);
    }
    return Array.from(sheets);
  }
}

export class Actors extends WorldCollection {
  static override documentName = "Actor";
}

export class Items extends WorldCollection {
  static override documentName = "Item";
}

export class Journal extends WorldCollection {
  static override documentName = "JournalEntry";
}

export class Folders extends WorldCollection {
  static override documentName = "Folder";
}

export class Scenes extends WorldCollection {
  static override documentName = "Scene";

  override get directory(): any {
    return currentUi()?.scenes;
  }

  get active(): any {
    return this.find((scene: any) => scene.active) ?? null;
  }

  get viewed(): any {
    return currentCanvas()?.scene ?? null;
  }

  get current(): any {
    return this.active;
  }
}

export class Messages extends WorldCollection {
  static override documentName = "ChatMessage";

  override get directory(): any {
    return currentUi()?.chat;
  }

  /** GM-only: deletes every chat message in the world. */
  async flush(): Promise<unknown> {
    if (!currentGame()?.user?.isGM) return [];
    return this.documentClass.deleteDocuments([], { deleteAll: true });
  }

  export(): string {
    return this.contents.map((message: { export(): string }) => message.export()).join("\n---------------------------\n");
  }
}
