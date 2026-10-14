import { CONST, DialogV2 } from "@tabbletop/api";
import { SHEET_SHARE_EVERYONE, SHEET_SHARE_FLAG, sheetShareAccess, sheetShareSchema, type SheetShare, type SheetShareAccess } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { MIMICDICE_FLAG_SCOPE } from "./actorRoles";

type ShareChoice = SheetShareAccess | "none";

const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const NONE = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
const SHARE_PATH = `flags.${MIMICDICE_FLAG_SCOPE}.${SHEET_SHARE_FLAG}`;
const SHARE_CHANGE_PATTERN = new RegExp(`[".](-=)?${SHEET_SHARE_FLAG}\\b`);

const CHOICES: ReadonlyArray<{ value: ShareChoice; label: string }> = [
  { value: "none", label: "Não" },
  { value: "view", label: "Ver" },
  { value: "edit", label: "Ver e editar" },
];

export function currentSheetShare(actor: any): SheetShare {
  const parsed = sheetShareSchema.safeParse(actor.getFlag?.(MIMICDICE_FLAG_SCOPE, SHEET_SHARE_FLAG) ?? {});
  return parsed.success ? parsed.data : {};
}

export function isSheetShared(actor: any): boolean {
  return Object.keys(currentSheetShare(actor)).length > 0;
}

export interface LinkedSheet {
  actor: any;
  access: SheetShareAccess;
}

/** Sheets the GM shared with any of these players, the most generous access first per sheet; `exceptId` is left out. */
export function sheetsSharedWith(userIds: readonly string[], exceptId: string | null): LinkedSheet[] {
  if (userIds.length === 0) return [];
  const linked: LinkedSheet[] = [];
  for (const actor of game.actors?.contents ?? []) {
    if (actor.id === exceptId) continue;
    const grants = userIds.map((userId) => sheetShareAccess(actor._source, userId));
    const access = grants.includes("edit") ? "edit" : grants.includes("view") ? "view" : null;
    if (access) linked.push({ actor, access });
  }
  return linked.sort((left, right) => String(left.actor.name).localeCompare(String(right.actor.name)));
}

/** Changes arrive expanded or with dotted keys, so the flag name is looked up anywhere in them. */
function touchesSheetShare(changes: Record<string, any>): boolean {
  return SHARE_CHANGE_PATTERN.test(JSON.stringify(changes ?? {}));
}

function refreshOpenSheets(): void {
  for (const actor of game.actors?.contents ?? []) {
    if (actor.sheet?.rendered) void actor.sheet.render();
  }
}

/** Open sheets redraw their linked list when the GM shares, unshares, creates or deletes a sheet. */
export function installLinkedSheetRefresh(): void {
  Hooks.on("updateActor", (_actor: any, changes: Record<string, any>) => {
    if (touchesSheetShare(changes)) refreshOpenSheets();
  });
  for (const hook of ["createActor", "deleteActor"]) {
    Hooks.on(hook, (actor: any) => {
      if (isSheetShared(actor)) refreshOpenSheets();
    });
  }
}

/** Buttons that open the sheets linked to this character's player; null when there is none. */
export function buildLinkedSheets(actor: any, playerIds: readonly string[]): HTMLElement | null {
  const linked = sheetsSharedWith(playerIds, actor.id);
  if (linked.length === 0) return null;
  const buttons = linked.map(({ actor: linkedActor, access }) => {
    const accessLabel = access === "edit" ? "pode editar" : "só leitura";
    const button = h(
      "button",
      { type: "button", class: "md-linked-sheet", title: `Abrir a ficha de ${linkedActor.name} (${accessLabel})` },
      h("i", { class: access === "edit" ? "fa-solid fa-pen-to-square" : "fa-solid fa-eye", "aria-hidden": "true" }),
      ` ${linkedActor.name}`,
    );
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void linkedActor.sheet?.render(true);
    });
    return button;
  });
  return h("div", { class: "md-linked-sheets", role: "group", "aria-label": "Fichas vinculadas" }, h("span", { class: "md-linked-label" }, h("i", { class: "fa-solid fa-link", "aria-hidden": "true" }), " Fichas vinculadas"), ...buttons);
}

function choiceSelect(label: string, current: ShareChoice): HTMLSelectElement {
  const select = h("select", { "aria-label": `Acesso de ${label}` });
  for (const choice of CHOICES) select.append(h("option", { value: choice.value, selected: choice.value === current }, choice.label));
  return select;
}

function ownershipLevelOf(actor: any, key: string): number {
  const ownership = actor._source?.ownership ?? {};
  const level = Number(ownership[key]);
  return Number.isFinite(level) ? level : NONE;
}

/**
 * Sharing rides on visibility: whoever gets the sheet must see it at least as an observer. Unsharing drops only an
 * observer level, so a player's own character (owner) or a limited view set by hand stays as it was.
 */
function ownershipChanges(actor: any, before: SheetShare, after: SheetShare): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const ownershipKey = key === SHEET_SHARE_EVERYONE ? "default" : key;
    const level = ownershipLevelOf(actor, ownershipKey);
    if (after[key] && level < OBSERVER) changes[`ownership.${ownershipKey}`] = OBSERVER;
    if (!after[key] && before[key] && level === OBSERVER) {
      if (ownershipKey === "default") changes["ownership.default"] = NONE;
      else changes[`ownership.-=${ownershipKey}`] = null;
    }
  }
  return changes;
}

async function saveSheetShare(actor: any, next: SheetShare): Promise<void> {
  const before = currentSheetShare(actor);
  const changes: Record<string, unknown> = { [SHARE_PATH]: sheetShareSchema.parse(next), ...ownershipChanges(actor, before, next) };
  for (const key of Object.keys(before)) {
    if (!next[key]) changes[`${SHARE_PATH}.-=${key}`] = null;
  }
  await actor.update(changes);
}

/** GM only: hand this sheet to every player or to chosen players, to read or also to fill in. Never gives token control. */
export async function shareSheetDialog(actor: any): Promise<void> {
  if (!game.user.isGM) return;
  const current = currentSheetShare(actor);
  const rows: Array<{ key: string; select: HTMLSelectElement }> = [{ key: SHEET_SHARE_EVERYONE, select: choiceSelect("todos os jogadores", current[SHEET_SHARE_EVERYONE] ?? "none") }];
  for (const player of game.users.players) rows.push({ key: player.id, select: choiceSelect(player.name, current[player.id] ?? "none") });
  const labels = ["Todos os jogadores", ...game.users.players.map((player: any) => player.name)];
  const content = h(
    "div",
    { class: "md-share-form" },
    h("p", { class: "hint" }, `Quem pode abrir a ficha de ${actor.name}. Compartilhar não dá controle do token nem a visão do personagem.`),
    ...rows.map((row, index) => h("label", { class: "md-share-row" }, h("span", {}, labels[index]), row.select)),
  );
  const confirmed = await DialogV2.prompt({ window: { title: "Compartilhar ficha" }, position: { width: 420 } as any, content, ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => true } });
  if (confirmed !== true) return;
  const next: SheetShare = {};
  for (const row of rows) {
    if (row.select.value === "view" || row.select.value === "edit") next[row.key] = row.select.value;
  }
  await saveSheetShare(actor, next);
  ui.notifications.info(Object.keys(next).length > 0 ? "Ficha compartilhada." : "A ficha não está mais compartilhada.");
}
