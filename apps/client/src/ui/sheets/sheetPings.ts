import { sheetPingBroadcastSchema, SOCKET_EVENTS, type SheetPingRequest } from "@tabbletop/protocol";
import type { Socket } from "socket.io-client";
import { h } from "../../views/dom";

let pingSocket: Socket | null = null;
const PING_DURATION_MS = 4500;

interface PingAuthor {
  name?: string;
  color?: unknown;
}

export function registerSheetPingSocket(socket: Socket): void {
  pingSocket = socket;
}

export function sendSheetPing(ping: SheetPingRequest): void {
  if (!pingSocket) return;
  pingSocket.emit(SOCKET_EVENTS.SHEET_PING, ping);
  playLocalPing(ping, game.user);
  ui.notifications.info(`Destacado para os jogadores: "${ping.label || "Campo"}"`);
}

function playLocalPing(ping: SheetPingRequest, author: PingAuthor | null | undefined): void {
  const actor = game.actors.get(ping.actorId);
  if (!actor || !actor.sheet?.rendered) return;
  highlightPingTarget(actor.sheet, ping, author);
}

function highlightPingTarget(sheet: any, ping: SheetPingRequest, author: PingAuthor | null | undefined): void {
  const root = sheet.element as HTMLElement | null;
  if (!root) return;

  if (ping.tab && typeof sheet.setTab === "function") {
    sheet.setTab(ping.tab);
  }
  if (ping.pageId && typeof sheet.setPage === "function") {
    sheet.setPage(ping.pageId);
  }

  // Small delay allows tab or page DOM switch to settle
  setTimeout(() => {
    let target: HTMLElement | null = null;
    if (ping.skillKey) target = root.querySelector(`[data-skill-key="${ping.skillKey}"]`);
    if (!target && ping.componentId) target = root.querySelector(`[data-component-id="${ping.componentId}"]`);
    if (!target && ping.abilityId) target = root.querySelector(`[data-ability-id="${ping.abilityId}"]`);
    if (!target && ping.itemId) target = root.querySelector(`[data-item-id="${ping.itemId}"]`);
    if (!target) target = root.querySelector(".md-board") ?? root;

    if (!target) return;

    target.classList.remove("md-sheet-ping-active");
    // Trigger DOM reflow to restart animation if already active
    void target.offsetWidth;
    target.classList.add("md-sheet-ping-active");

    const color = typeof author?.color === "string" ? author.color : "#3b82f6";
    target.style.setProperty("--md-ping-color", color);

    const oldBadge = target.querySelector(".md-sheet-ping-badge");
    oldBadge?.remove();

    const authorName = author?.name ? author.name.trim() : "Mestre";
    const labelText = ping.label ? ping.label.trim() : "Olhe aqui!";
    const badge = h(
      "div",
      { class: "md-sheet-ping-badge", style: `--md-ping-color:${color}` },
      h("i", { class: "fa-solid fa-bullseye" }),
      ` ${authorName}: ${labelText}`,
    );
    target.append(badge);

    target.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      badge.remove();
      target?.classList.remove("md-sheet-ping-active");
    }, PING_DURATION_MS);
  }, 60);
}

export function listenForSheetPings(socket: Socket): void {
  registerSheetPingSocket(socket);
  socket.on(SOCKET_EVENTS.SHEET_PING, (payload: unknown) => {
    const parsed = sheetPingBroadcastSchema.safeParse(payload);
    if (!parsed.success) return;

    const data = parsed.data;
    const actor = game.actors.get(data.actorId);
    if (!actor) return;

    const isRelevant = game.user.isGM || actor.isOwner || actor.sheet?.rendered;
    if (!isRelevant) return;

    const author = game.users.get(data.userId);

    if (!actor.sheet?.rendered) {
      void actor.sheet.render(true);
      setTimeout(() => {
        highlightPingTarget(actor.sheet, data, author);
      }, 350);
    } else {
      actor.sheet.bringToTop?.();
      highlightPingTarget(actor.sheet, data, author);
    }

    if (data.userId !== game.user.id) {
      const authorName = author?.name ? author.name.trim() : "O mestre";
      ui.notifications.info(`${authorName} destacou "${data.label || "um campo"}" na sua ficha!`);
    }
  });
}
