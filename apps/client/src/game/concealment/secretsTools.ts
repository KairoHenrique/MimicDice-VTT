import { DialogV2 } from "@tabbletop/api";
import { canBeRevealed, CHEST_FLAG, chestSchema, readConcealment, TRAP_FLAG, trapSchema, type Concealment } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { chestOf } from "../chests/chestActions";
import { openChestWindow } from "../chests/chestWindow";
import { concealmentDialog } from "./concealmentDialog";
import { toggleRevealed } from "./perception";

const CHEST_IMAGE = "icons/svg/chest.svg";
const TRAP_IMAGE = "icons/svg/trap.svg";

function viewCenter(): { x: number; y: number } | null {
  const view = canvas.app?.view?.getBoundingClientRect?.();
  if (!view || !canvas.ready) return null;
  return canvas.stage.toLocal({ x: view.width / 2, y: view.height / 2 });
}

const MAX_DRAW_WAIT_FRAMES = 30;

/** A freshly created document is drawn on the canvas a few frames later. */
async function drawnObject(document: any): Promise<any | null> {
  for (let frame = 0; frame < MAX_DRAW_WAIT_FRAMES && !document.object; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
  return document.object ?? null;
}

/** A one-square tile in the middle of the screen, selected on the Tiles layer so it can be dragged right away. */
async function createSecretTile(imagePath: string, flags: Record<string, unknown>): Promise<any | null> {
  const center = viewCenter();
  if (!game.user.isGM || !center || !canvas.scene) return null;
  const size = Number(canvas.grid?.size) || 100;
  const corner = canvas.grid.getSnappedPoint({ x: center.x - size / 2, y: center.y - size / 2 }, { mode: "quarter" });
  const [document] = await canvas.scene.createEmbeddedDocuments("Tile", [{ x: corner.x, y: corner.y, width: size, height: size, texture: { src: imagePath }, flags }]);
  if (!document) return null;
  canvas.tiles?.activate?.();
  (await drawnObject(document))?.control?.({ releaseOthers: true });
  return document;
}

export async function createChest(): Promise<void> {
  const chest = chestSchema.parse({ name: "Baú", entries: [] });
  const document = await createSecretTile(CHEST_IMAGE, { core: { [CHEST_FLAG]: chest } });
  const tile = document ? await drawnObject(document) : null;
  if (!tile) return;
  ui.notifications.info("Baú criado no centro da tela. Arraste para posicionar e coloque os itens na janela.");
  await openChestWindow(tile);
}

export async function createTrap(): Promise<void> {
  const trap = trapSchema.parse({ name: "Armadilha", message: "", effectId: null, effectTurns: 3, triggered: false });
  const document = await createSecretTile(TRAP_IMAGE, { world: { [TRAP_FLAG]: trap } });
  if (!document) return;
  ui.notifications.info("Armadilha criada no centro da tela. Arraste para posicionar; ela fica invisível para os jogadores.");
  await concealmentDialog(document);
}

/** GM: double-clicking a chest opens its window; a trap or a hidden object opens its perception settings. */
export function installSecretDoubleClick(): void {
  const tileClass = CONFIG.Tile?.objectClass;
  if (!tileClass) return;
  tileClass.doubleClickRule = (tile: any) => {
    if (!game.user.isGM) return false;
    if (chestOf(tile)) {
      void openChestWindow(tile);
      return true;
    }
    const concealment = readConcealment(tile.document?._source?.flags?.world);
    if (!concealment.trap && !concealment.perceptionDc) return false;
    void concealmentDialog(tile.document);
    return true;
  };
}

interface SecretEntry {
  document: any;
  concealment: Concealment;
  icon: string;
  label: string;
  details: string[];
}

function baseDetails(concealment: Concealment): string[] {
  const details: string[] = [];
  if (concealment.perceptionDc) details.push(`DT ${concealment.perceptionDc}`);
  if (concealment.trap) details.push(concealment.trap.triggered ? "disparada" : "armada");
  if (concealment.revealed) details.push("revelado");
  return details;
}

function tileSecret(tileDocument: any): SecretEntry | null {
  const concealment = readConcealment(tileDocument._source?.flags?.world);
  const chest = tileDocument.object ? chestOf(tileDocument.object) : null;
  if (!chest && !concealment.trap && !concealment.perceptionDc) return null;
  const details = baseDetails(concealment);
  if (chest) details.push(chest.capacity === null ? `${chest.entries.length} item(ns)` : `${chest.entries.length}/${chest.capacity} itens`);
  const base = { document: tileDocument, concealment, details };
  if (chest) return { ...base, icon: "fa-solid fa-box-archive", label: chest.name };
  if (concealment.trap) return { ...base, icon: "fa-solid fa-burst", label: concealment.trap.name };
  return { ...base, icon: "fa-solid fa-eye-low-vision", label: "Objeto escondido" };
}

function noteSecret(noteDocument: any): SecretEntry | null {
  const concealment = readConcealment(noteDocument._source?.flags?.world);
  if (!concealment.perceptionDc) return null;
  return { document: noteDocument, concealment, icon: "fa-solid fa-bookmark", label: String(noteDocument.text || noteDocument.entry?.name || "Nota"), details: baseDetails(concealment) };
}

function secretOf(document: any): SecretEntry | null {
  return document.documentName === "Note" ? noteSecret(document) : tileSecret(document);
}

function sceneSecrets(): SecretEntry[] {
  const scene = canvas.scene;
  if (!scene) return [];
  const documents = [...(scene.tiles?.contents ?? []), ...(scene.notes?.contents ?? [])];
  return documents.map(secretOf).filter((entry): entry is SecretEntry => entry !== null);
}

function focusOn(document: any): void {
  const width = Number(document.width) || 0;
  const height = Number(document.height) || 0;
  void canvas.animatePan?.({ x: Number(document.x) + width / 2, y: Number(document.y) + height / 2 });
  document.object?.layer?.activate?.();
  document.object?.control?.({ releaseOthers: true });
}

function editSecret(entry: SecretEntry): void {
  if (entry.document.documentName === "Tile" && entry.document.object && chestOf(entry.document.object)) void openChestWindow(entry.document.object);
  else void concealmentDialog(entry.document);
}

function secretRow(entry: SecretEntry): HTMLElement {
  const show = h("button", { type: "button", class: "md-secret-action", "aria-label": `Mostrar ${entry.label} no mapa` }, h("i", { class: "fa-solid fa-location-crosshairs", "aria-hidden": "true" }));
  show.title = "Mostrar no mapa";
  show.addEventListener("click", () => focusOn(entry.document));
  const edit = h("button", { type: "button", class: "md-secret-action", "aria-label": `Editar ${entry.label}` }, h("i", { class: "fa-solid fa-pen", "aria-hidden": "true" }));
  edit.title = "Editar";
  edit.addEventListener("click", () => editSecret(entry));
  const row = h(
    "li",
    { class: "md-secret-row" },
    h("i", { class: `${entry.icon} md-secret-icon`, "aria-hidden": "true" }),
    h("span", { class: "md-secret-label", title: entry.label }, entry.label),
    h("span", { class: "md-secret-details" }, entry.details.join(" · ")),
    revealButton(entry, (updated) => row.replaceWith(updated ? secretRow(updated) : h("li", { class: "hint" }, "Removido."))),
    show,
    edit,
  );
  return row;
}

/** Shows the object to everyone, or hides it again; disabled when there is nothing hidden to reveal. */
function revealButton(entry: SecretEntry, redraw: (updated: SecretEntry | null) => void): HTMLButtonElement {
  const { revealed } = entry.concealment;
  const label = revealed ? `Esconder ${entry.label} de novo` : `Revelar ${entry.label} para todos`;
  const reveal = h("button", { type: "button", class: "md-secret-action", "aria-label": label, "aria-pressed": String(revealed) }, h("i", { class: revealed ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", "aria-hidden": "true" }));
  reveal.title = revealed ? "Revelado para todos. Clique para esconder de novo." : "Revelar para todos";
  reveal.classList.toggle("active", revealed);
  reveal.disabled = !revealed && !canBeRevealed(entry.concealment);
  reveal.addEventListener("click", async () => {
    reveal.disabled = true;
    await toggleRevealed(entry.document);
    redraw(secretOf(entry.document));
  });
  return reveal;
}

/** GM overview of everything hidden on this scene: chests, traps and objects with a perception DC. */
export async function secretsListDialog(): Promise<void> {
  if (!game.user.isGM || !canvas.scene) return;
  const secrets = sceneSecrets();
  const content = h(
    "div",
    { class: "md-secrets" },
    secrets.length
      ? h("ul", { class: "md-secret-list" }, ...secrets.map(secretRow))
      : h("p", { class: "hint" }, "Nenhum baú, armadilha ou objeto com percepção nesta cena. Use os botões de baú e armadilha, ou clique direito num tile ou nota."),
  );
  await DialogV2.prompt({ window: { title: "Segredos desta cena" }, position: { width: 460 } as any, content, ok: { label: "Fechar", callback: () => true } });
}
