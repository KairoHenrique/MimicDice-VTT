import type { MenuEntry } from "@tabbletop/api";
import { configureTokenControl } from "../ui/actors/tokenControlPermissions";
import { findOwnCharacter } from "../ui/actors/ownCharacter";
import { h } from "../views/dom";

const BANNER_ID = "puppet-banner";

/** The sheet opened when taking control, closed again on release; a sheet the GM already had open stays open. */
let sheetOpenedForPuppet: any = null;

function currentPuppet(): any | null {
  return canvas?.tokens?.puppet ?? null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** GM only: looks through the token's eyes, moves it (mouse or WASD) and rolls as its character. */
export async function startPuppet(token: any): Promise<void> {
  if (!game.user.isGM || !canvas.ready) return;
  if (canvas.activeLayer?.name !== "tokens") await ui.controls?.activate({ control: "tokens" });
  if (!canvas.tokens.setPuppet(token)) return;
  void canvas.animatePan({ x: token.center.x, y: token.center.y });
  const sheet = token.actor?.sheet;
  if (sheet && !sheet.rendered) {
    sheet.render(true);
    sheetOpenedForPuppet = sheet;
  }
}

export function stopPuppet(): void {
  if (!currentPuppet()) return;
  canvas.tokens.setPuppet(null);
}

function closePuppetSheet(): void {
  const sheet = sheetOpenedForPuppet;
  sheetOpenedForPuppet = null;
  if (sheet?.rendered) void sheet.close();
}

function renderBanner(token: any | null): void {
  document.getElementById(BANNER_ID)?.remove();
  document.body.classList.toggle("puppet-active", Boolean(token));
  if (!token) {
    closePuppetSheet();
    return;
  }
  const leave = h("button", { type: "button", class: "puppet-leave" }, h("i", { class: "fa-solid fa-right-from-bracket", "aria-hidden": "true" }), " Sair (Esc)");
  leave.addEventListener("click", () => stopPuppet());
  const banner = h(
    "div",
    { id: BANNER_ID, class: "puppet-banner", role: "status", "aria-live": "polite", "data-help": "puppet" },
    h("i", { class: "fa-solid fa-gamepad", "aria-hidden": "true" }),
    h("span", {}, `Controlando ${token.name ?? "boneco"}: você vê só o que ele vê`),
    leave,
  );
  document.body.append(banner);
}

/** Right click on a token: take or leave control, and choose which players may control it. */
function tokenEntries(token: any): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (currentPuppet() === token) entries.push({ label: "Sair do controle", icon: "fa-solid fa-right-from-bracket", onSelect: () => stopPuppet() });
  else entries.push({ label: "Controlar boneco", icon: "fa-solid fa-gamepad", onSelect: () => startPuppet(token) });
  if (token.actor) entries.push({ label: "Quem pode controlar", icon: "fa-solid fa-users-gear", onSelect: () => configureTokenControl(token.actor) });
  return entries;
}

/** For the board's right-click menu: a way out of the puppet's eyes from anywhere on the map. */
export function puppetBoardEntries(): MenuEntry[] {
  const puppet = currentPuppet();
  return puppet ? [{ label: `Sair do controle de ${puppet.name ?? "boneco"}`, icon: "fa-solid fa-right-from-bracket", onSelect: () => stopPuppet() }] : [];
}

/** The token a player plays on the viewed scene: their character's first, otherwise any token they own. */
function playerTokenOnCanvas(user: any): any | null {
  const tokens: any[] = canvas.tokens?.placeables ?? [];
  const characterId = findOwnCharacter(user)?.id;
  return tokens.find((token) => characterId && token.document.actorId === characterId) ?? tokens.find((token) => token.actor?.testUserPermission?.(user, "OWNER")) ?? null;
}

/** For the players list: take over the player's character on the current scene. */
export function playerPuppetEntries(user: any): MenuEntry[] {
  if (!game.user.isGM || user.isGM) return [];
  const token = canvas.ready ? playerTokenOnCanvas(user) : null;
  if (!token) return [{ heading: true, label: `${user.name} não tem boneco nesta cena`, icon: "" }];
  return [{ label: `Controlar o boneco de ${user.name}`, icon: "fa-solid fa-gamepad", onSelect: () => startPuppet(token) }];
}

export function registerPuppetControl(): void {
  if (!game.user.isGM) return;
  Hooks.on("getTokenMenuEntries", (token: any, entries: MenuEntry[]) => entries.push(...tokenEntries(token)));
  Hooks.on("puppetToken", (token: any | null) => renderBanner(token));
  Hooks.on("deleteToken", (document: any) => {
    if (document.id === canvas?.tokens?.puppetId) canvas.tokens.setPuppet(null);
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !currentPuppet() || isEditableTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stopPuppet();
    },
    { capture: true },
  );
}
