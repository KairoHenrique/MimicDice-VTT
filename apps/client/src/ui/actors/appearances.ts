import { DialogV2, FilePicker, normalizeDataPath, type MenuEntry } from "@tabbletop/api";
import {
  ACTIVE_APPEARANCE_FLAG,
  APPEARANCES_FLAG,
  appearancesSchema,
  DEFAULT_PORTRAIT_FOCUS,
  MAX_APPEARANCES,
  PORTRAIT_FOCUS_FLAG,
  portraitFocusSchema,
  type ActorAppearance,
  type PortraitFocus,
} from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { MIMICDICE_FLAG_SCOPE } from "./actorRoles";

const FLAG_PATH = `flags.${MIMICDICE_FLAG_SCOPE}`;
const PORTRAIT_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const GM_PORTRAIT_FOLDER = "uploads/personagens";
const PAN_CLICK_THRESHOLD_PX = 6;

function clampFocus(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

export function actorPortraitFocus(actor: any): PortraitFocus {
  const parsed = portraitFocusSchema.safeParse(actor?.getFlag?.(MIMICDICE_FLAG_SCOPE, PORTRAIT_FOCUS_FLAG));
  return parsed.success ? parsed.data : DEFAULT_PORTRAIT_FOCUS;
}

async function savePortraitFocus(actor: any, focus: PortraitFocus): Promise<void> {
  await actor.update({ [`${FLAG_PATH}.${PORTRAIT_FOCUS_FLAG}`]: portraitFocusSchema.parse(focus) });
}

function applyFocusStyle(image: HTMLImageElement, focus: PortraitFocus): void {
  image.style.objectPosition = `${focus.x}% ${focus.y}%`;
}

/** Same framing as the sheet portrait: header, sidebar, status, combat, etc. */
export function applyActorPortraitFocus(image: HTMLImageElement, actor: any): HTMLImageElement {
  applyFocusStyle(image, actorPortraitFocus(actor));
  return image;
}

export function actorAppearances(actor: any): ActorAppearance[] {
  const parsed = appearancesSchema.safeParse(actor?.getFlag?.(MIMICDICE_FLAG_SCOPE, APPEARANCES_FLAG) ?? []);
  return parsed.success ? parsed.data : [];
}

export function activeAppearanceId(actor: any): string | null {
  const id = actor?.getFlag?.(MIMICDICE_FLAG_SCOPE, ACTIVE_APPEARANCE_FLAG);
  return typeof id === "string" ? id : null;
}

/** Owners and the GM switch looks; the server only lets owners write the actor and its tokens anyway. */
export function canChangeAppearance(actor: any): boolean {
  return Boolean(actor && (game.user.isGM || actor.isOwner));
}

function newAppearanceId(): string {
  return crypto.getRandomValues(new Uint32Array(2)).reduce((text, part) => text + part.toString(36), "").slice(0, 16);
}

async function saveAppearances(actor: any, appearances: ActorAppearance[], activeId: string | null): Promise<void> {
  await actor.update({ [`${FLAG_PATH}.${APPEARANCES_FLAG}`]: appearancesSchema.parse(appearances), [`${FLAG_PATH}.${ACTIVE_APPEARANCE_FLAG}`]: activeId });
}

/** Every token of this actor on the scenes the user can see takes the new picture, plus the sheet and future tokens. */
export async function applyAppearance(actor: any, appearance: ActorAppearance): Promise<void> {
  await actor.update({ img: appearance.img, "prototypeToken.texture.src": appearance.img, [`${FLAG_PATH}.${ACTIVE_APPEARANCE_FLAG}`]: appearance.id });
  const scenes: any[] = game.scenes?.contents ?? [];
  const results = await Promise.allSettled(
    scenes.map((scene) => {
      const updates = (scene.tokens?.contents ?? []).filter((token: any) => token.actorId === actor.id && token.texture?.src !== appearance.img).map((token: any) => ({ _id: token.id, "texture.src": appearance.img }));
      return updates.length > 0 ? scene.updateEmbeddedDocuments("Token", updates) : Promise.resolve([]);
    }),
  );
  if (results.some((result) => result.status === "rejected")) ui.notifications.warn("A ficha mudou, mas algum token no mapa não pôde ser trocado agora (mapa travado ou sessão fechada).");
}

function pickImage(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const picker = new FilePicker.implementation({
      type: "image",
      current: current || "uploads/compartilhado",
      callback: (path: string) => resolve(path),
    });
    void picker.render({ force: true });
  });
}

function portraitFolder(): string {
  return game.user.isGM ? GM_PORTRAIT_FOLDER : `uploads/players/${game.user.id}`;
}

function imagePathFromDrop(dataTransfer: DataTransfer): string | null {
  const text = dataTransfer.getData("text/plain")?.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { texture?: { src?: unknown }; src?: unknown };
    const candidate = parsed?.texture?.src ?? parsed?.src ?? null;
    if (typeof candidate === "string") {
      const path = normalizeDataPath(candidate);
      return PORTRAIT_IMAGE_PATTERN.test(path) ? path : null;
    }
  } catch {
    /* plain path */
  }
  const path = normalizeDataPath(text);
  return PORTRAIT_IMAGE_PATTERN.test(path) ? path : null;
}

/** Sets the character picture (sheet + tokens). Updates the active appearance when there is one. */
export async function setActorPortrait(actor: any, img: string): Promise<void> {
  if (!canChangeAppearance(actor)) return;
  const path = normalizeDataPath(img);
  if (!PORTRAIT_IMAGE_PATTERN.test(path)) {
    ui.notifications.warn("Escolha uma imagem (png, jpg, webp, gif, svg).");
    return;
  }
  const appearances = actorAppearances(actor);
  const activeId = activeAppearanceId(actor);
  const active = appearances.find((appearance) => appearance.id === activeId);
  const focusReset = { [`${FLAG_PATH}.${PORTRAIT_FOCUS_FLAG}`]: DEFAULT_PORTRAIT_FOCUS };
  if (active) {
    await saveAppearances(
      actor,
      appearances.map((appearance) => (appearance.id === activeId ? { ...appearance, img: path } : appearance)),
      activeId,
    );
    await actor.update(focusReset);
    await applyAppearance(actor, { ...active, img: path });
    return;
  }
  await actor.update({ img: path, "prototypeToken.texture.src": path, ...focusReset });
  const scenes: any[] = game.scenes?.contents ?? [];
  const results = await Promise.allSettled(
    scenes.map((scene) => {
      const updates = (scene.tokens?.contents ?? [])
        .filter((token: any) => token.actorId === actor.id && token.texture?.src !== path)
        .map((token: any) => ({ _id: token.id, "texture.src": path }));
      return updates.length > 0 ? scene.updateEmbeddedDocuments("Token", updates) : Promise.resolve([]);
    }),
  );
  if (results.some((result) => result.status === "rejected")) {
    ui.notifications.warn("A ficha mudou, mas algum token no mapa não pôde ser trocado agora (mapa travado ou sessão fechada).");
  }
}

async function uploadPortraitFile(actor: any, file: File): Promise<void> {
  if (!PORTRAIT_IMAGE_PATTERN.test(file.name)) {
    ui.notifications.warn("Solte uma imagem (png, jpg, webp, gif, svg).");
    return;
  }
  const folder = portraitFolder();
  try {
    await FilePicker.createDirectory("data", folder);
  } catch {
    /* already exists */
  }
  const result = await FilePicker.upload("data", folder, file, {}, { notify: true });
  if (!result || typeof result !== "object") return;
  await setActorPortrait(actor, result.path);
}

export async function pickAndSetPortrait(actor: any): Promise<void> {
  if (!canChangeAppearance(actor)) return;
  const path = await pickImage(actor.img ?? "");
  if (path) await setActorPortrait(actor, path);
}

/** Sheet portrait (PC, NPC or enemy): drag to frame; click without drag to change the image. */
export function buildPortraitControl(actor: any, _editable: boolean): HTMLElement {
  const canEdit = canChangeAppearance(actor);
  const focus = actorPortraitFocus(actor);
  const image = h("img", {
    class: "md-c-image portrait",
    src: actor.img || "",
    alt: actor.name || "Retrato",
    loading: "lazy",
    decoding: "async",
    draggable: "false",
  }) as HTMLImageElement;
  applyFocusStyle(image, focus);

  const frame = h(
    "div",
    {
      class: canEdit ? "md-portrait-frame is-editable" : "md-portrait-frame",
      title: canEdit ? "Arraste para centralizar. Clique (sem arrastar) para trocar a imagem." : undefined,
      "aria-label": canEdit ? `Retrato de ${actor.name || "personagem"}: arraste para enquadrar` : actor.name || "Retrato",
    },
    image,
  ) as HTMLElement;

  if (!canEdit) return frame;

  frame.append(
    h("span", { class: "md-portrait-drop-hint", "aria-hidden": "true" }, h("i", { class: "fa-solid fa-up-down-left-right" }), " Arraste para centralizar"),
  );

  let pointerId: number | null = null;
  let startClientX = 0;
  let startClientY = 0;
  let startFocus = focus;
  let moved = false;
  let liveFocus = focus;

  frame.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    startClientX = event.clientX;
    startClientY = event.clientY;
    startFocus = { ...liveFocus };
    moved = false;
    frame.classList.add("is-panning");
    frame.setPointerCapture(event.pointerId);
  });

  frame.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startClientX;
    const dy = event.clientY - startClientY;
    if (!moved && Math.hypot(dx, dy) < PAN_CLICK_THRESHOLD_PX) return;
    moved = true;
    const rect = frame.getBoundingClientRect();
    liveFocus = {
      x: clampFocus(startFocus.x - (dx / Math.max(rect.width, 1)) * 100),
      y: clampFocus(startFocus.y - (dy / Math.max(rect.height, 1)) * 100),
    };
    applyFocusStyle(image, liveFocus);
  });

  const endPan = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    frame.classList.remove("is-panning");
    try {
      frame.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    pointerId = null;
    if (!moved) {
      void pickAndSetPortrait(actor).catch(() => ui.notifications.warn("Não foi possível trocar o retrato."));
      return;
    }
    const saved = liveFocus;
    void savePortraitFocus(actor, saved).catch(() => ui.notifications.warn("Não foi possível salvar o enquadramento."));
  };

  frame.addEventListener("pointerup", endPan);
  frame.addEventListener("pointercancel", endPan);

  frame.addEventListener("dragover", (event) => {
    const transfer = event.dataTransfer;
    if (!transfer || ![...transfer.types].some((type) => type === "Files" || type === "text/plain")) return;
    event.preventDefault();
    frame.classList.add("is-drop-target");
  });
  frame.addEventListener("dragleave", () => frame.classList.remove("is-drop-target"));
  frame.addEventListener("drop", (event) => {
    event.preventDefault();
    frame.classList.remove("is-drop-target");
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const file = transfer.files?.[0];
    if (file) {
      void uploadPortraitFile(actor, file).catch(() => ui.notifications.warn("Não foi possível enviar o retrato."));
      return;
    }
    const path = imagePathFromDrop(transfer);
    if (path) void setActorPortrait(actor, path).catch(() => ui.notifications.warn("Não foi possível trocar o retrato."));
  });

  return frame;
}

/** The current picture becomes the first look, so switching back to it is always possible. */
export async function addAppearance(actor: any): Promise<void> {
  const appearances = actorAppearances(actor);
  if (appearances.length >= MAX_APPEARANCES) {
    ui.notifications.warn(`No máximo ${MAX_APPEARANCES} aparências por personagem.`);
    return;
  }
  const path = await pickImage(actor.img ?? "");
  if (!path) return;
  const next = [...appearances];
  let activeId = activeAppearanceId(actor);
  if (next.length === 0 && actor.img && actor.img !== path) {
    activeId = newAppearanceId();
    next.push({ id: activeId, name: "Principal", img: actor.img });
  }
  if (next.length >= MAX_APPEARANCES) {
    ui.notifications.warn(`No máximo ${MAX_APPEARANCES} aparências por personagem.`);
    return;
  }
  next.push({ id: newAppearanceId(), name: `Aparência ${next.length + 1}`, img: path });
  try {
    await saveAppearances(actor, next, activeId);
  } catch {
    ui.notifications.warn("Não foi possível salvar a aparência. Use uma imagem do servidor.");
  }
}

export async function removeAppearance(actor: any, appearanceId: string): Promise<void> {
  const next = actorAppearances(actor).filter((appearance) => appearance.id !== appearanceId);
  const activeId = activeAppearanceId(actor);
  await saveAppearances(actor, next, activeId === appearanceId ? null : activeId);
}

export async function renameAppearance(actor: any, appearanceId: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return;
  const next = actorAppearances(actor).map((appearance) => (appearance.id === appearanceId ? { ...appearance, name: trimmed } : appearance));
  await saveAppearances(actor, next, activeAppearanceId(actor));
}

async function renameAppearanceDialog(actor: any, appearance: ActorAppearance): Promise<void> {
  const input = h("input", { type: "text", value: appearance.name, maxlength: 60, "aria-label": "Nome da aparência" });
  const name = await DialogV2.prompt({ window: { title: "Nome da aparência" }, content: h("div", {}, input), ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => input.value } });
  if (typeof name === "string") await renameAppearance(actor, appearance.id, name);
}

function appearanceThumb(actor: any, appearance: ActorAppearance, active: boolean): HTMLElement {
  const thumb = h("img", { src: appearance.img, alt: "", loading: "lazy" }) as HTMLImageElement;
  if (appearance.img === actor.img) applyActorPortraitFocus(thumb, actor);
  const choose = h(
    "button",
    { type: "button", class: `md-appearance${active ? " active" : ""}`, title: active ? `${appearance.name} (em uso)` : `Usar ${appearance.name}`, "aria-pressed": String(active) },
    thumb,
    h("span", { class: "md-appearance-name" }, appearance.name),
  );
  choose.addEventListener("click", () => void applyAppearance(actor, appearance).catch(() => ui.notifications.warn("Não foi possível trocar a aparência.")));
  choose.addEventListener("dblclick", () => void renameAppearanceDialog(actor, appearance));
  const remove = h("button", { type: "button", class: "icon md-appearance-remove", title: `Remover ${appearance.name}`, "aria-label": `Remover ${appearance.name}` }, h("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }));
  remove.addEventListener("click", () => void removeAppearance(actor, appearance.id));
  return h("li", { class: "md-appearance-item" }, choose, remove);
}

/** Sheet header strip: the character's looks, one click to switch, up to five. */
export function buildAppearanceStrip(actor: any): HTMLElement | null {
  if (!canChangeAppearance(actor)) return null;
  const appearances = actorAppearances(actor);
  const activeId = activeAppearanceId(actor);
  const list = h("ul", { class: "md-appearances", "aria-label": "Aparências" }, ...appearances.map((appearance) => appearanceThumb(actor, appearance, appearance.id === activeId || (!activeId && appearance.img === actor.img))));
  if (appearances.length < MAX_APPEARANCES) {
    const add = h("button", { type: "button", class: "md-appearance md-appearance-add", title: "Adicionar aparência", "aria-label": "Adicionar aparência" }, h("i", { class: "fa-solid fa-plus", "aria-hidden": "true" }));
    add.addEventListener("click", () => void addAppearance(actor));
    list.append(h("li", { class: "md-appearance-item" }, add));
  }
  return h("div", { class: "md-appearance-strip", "data-help": "appearances" }, h("span", { class: "md-appearance-title" }, "Aparências"), list);
}

/** Right click on a token: switch to another of the character's looks. */
export function appearanceMenuEntries(token: any): MenuEntry[] {
  const actor = token.actor;
  if (!canChangeAppearance(actor)) return [];
  const activeId = activeAppearanceId(actor);
  return actorAppearances(actor)
    .filter((appearance) => appearance.id !== activeId)
    .map((appearance) => ({ label: `Aparência: ${appearance.name}`, icon: "fa-solid fa-masks-theater", onSelect: () => applyAppearance(actor, appearance) }));
}

export function registerAppearanceMenu(): void {
  Hooks.on("getTokenMenuEntries", (token: any, entries: MenuEntry[]) => entries.push(...appearanceMenuEntries(token)));
}
