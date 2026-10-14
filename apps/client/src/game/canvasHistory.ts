import type { PlainObject } from "@tabbletop/common";
import { CanvasHistory, inverseUpdate, type HistoryEntry, type HistoryStep } from "./canvasHistoryRules";

const PLACEABLE_DOCUMENTS = ["Token", "Tile", "Wall", "AmbientLight", "AmbientSound", "Note", "Drawing", "MeasuredTemplate"];
const BURST_MS = 60;
/** Operations replayed by the history (or made on someone else's behalf) carry this so they are not recorded again. */
export const SKIP_HISTORY = { canvasHistory: false } as const;

const history = new CanvasHistory(BURST_MS);

function sceneIdOf(document: any): string | null {
  const parent = document?.parent;
  return parent?.documentName === "Scene" && parent.id === canvas.scene?.id ? parent.id : null;
}

function record(document: any, options: any, entry: HistoryEntry): void {
  const sceneId = sceneIdOf(document);
  if (!sceneId || options?.canvasHistory === false) return;
  history.record(sceneId, entry, performance.now());
}

function listenFor(documentName: string): void {
  Hooks.on(`preUpdate${documentName}`, (document: any, changes: PlainObject, options: any) => {
    record(document, options, { action: "update", documentName, updates: [inverseUpdate(document._source, changes)] });
  });
  Hooks.on(`preDelete${documentName}`, (document: any, options: any) => {
    record(document, options, { action: "delete", documentName, data: [document.toObject()] });
  });
  Hooks.on(`create${documentName}`, (document: any, options: any, userId: string) => {
    if (userId === game.user.id) record(document, options, { action: "create", documentName, ids: [document.id] });
  });
}

async function revertEntry(scene: any, entry: HistoryEntry): Promise<void> {
  const collection = scene.getEmbeddedCollection(entry.documentName);
  if (entry.action === "create") {
    const ids = entry.ids.filter((id) => collection.has(id));
    if (ids.length) await scene.deleteEmbeddedDocuments(entry.documentName, ids, SKIP_HISTORY);
  } else if (entry.action === "update") {
    const updates = entry.updates.filter((update) => collection.has(update._id));
    if (updates.length) await scene.updateEmbeddedDocuments(entry.documentName, updates, SKIP_HISTORY);
  } else {
    const data = entry.data.filter((source) => !collection.has(source._id));
    if (data.length) await scene.createEmbeddedDocuments(entry.documentName, data, { ...SKIP_HISTORY, keepId: true });
  }
}

async function revertStep(step: HistoryStep): Promise<void> {
  const scene = game.scenes.get(step.sceneId);
  if (!scene) return;
  for (const entry of [...step.entries].reverse()) await revertEntry(scene, entry);
}

/** Ctrl+Z belongs to the map only while nothing else (a sheet, a dialog) has the keyboard focus. */
function mapHasFocus(): boolean {
  const focused = document.activeElement;
  return !focused || focused === document.body || focused.tagName === "CANVAS";
}

async function undoLastStep(): Promise<void> {
  const step = history.pop();
  if (!step) {
    ui.notifications.info("Nada para desfazer no mapa.");
    return;
  }
  try {
    await revertStep(step);
  } catch {
    ui.notifications.warn("Não deu para desfazer essa alteração.");
  }
}

/** Per-user undo of what this user did on the open map: moves, edits, creations and deletions. */
export function installCanvasHistory(): void {
  for (const documentName of PLACEABLE_DOCUMENTS) listenFor(documentName);
  Hooks.on("canvasReady", () => history.clear());
  game.keybindings.register("core", "undoCanvas", {
    name: "Desfazer no mapa",
    hint: "Desfaz seu último movimento, edição, criação ou exclusão no mapa aberto.",
    editable: [{ key: "KeyZ", modifiers: ["Control"] }],
    onDown: () => {
      if (!canvas.ready || !mapHasFocus()) return false;
      void undoLastStep();
      return true;
    },
  });
}
