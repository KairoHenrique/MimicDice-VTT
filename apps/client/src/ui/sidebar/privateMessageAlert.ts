import { h } from "../../views/dom";
import { ChatLog } from "./ChatLog";
import { isIncomingPrivateMessage, messagePreview } from "./privateMessageRules";

const POPUP_LIFETIME_MS = 8_000;
const MAX_VISIBLE_POPUPS = 3;
const CHIME_NOTES_HZ = [880, 1320] as const;
const CHIME_NOTE_SECONDS = 0.12;
const CHIME_VOLUME = 0.12;

function playChime(): void {
  const audio = game.audio;
  if (!audio || audio.locked) return;
  const context: AudioContext = audio.interface;
  const start = context.currentTime;
  CHIME_NOTES_HZ.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + index * CHIME_NOTE_SECONDS;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(CHIME_VOLUME, noteStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + CHIME_NOTE_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + CHIME_NOTE_SECONDS);
    oscillator.addEventListener("ended", () => gain.disconnect());
  });
}

function popupStack(): HTMLElement {
  let stack = document.getElementById("private-message-alerts");
  if (!stack) {
    stack = h("div", { id: "private-message-alerts", class: "private-message-alerts", role: "region", "aria-label": "Mensagens privadas", "aria-live": "polite" });
    document.body.append(stack);
  }
  return stack;
}

function openChat(): void {
  ui.sidebar?.toggleExpanded?.(true);
  ui.sidebar?.changeTab?.(ChatLog.tabName);
}

function showPopup(senderName: string, preview: string): void {
  const stack = popupStack();
  const close = h("button", { type: "button", class: "private-message-close", "aria-label": "Fechar aviso" }, h("i", { class: "fa-solid fa-xmark", "aria-hidden": "true" }));
  const open = h("button", { type: "button", class: "private-message-open" }, h("i", { class: "fa-solid fa-comments", "aria-hidden": "true" }), " Abrir chat");
  const popup = h(
    "div",
    { class: "private-message-alert", role: "status" },
    h("div", { class: "private-message-head" }, h("i", { class: "fa-solid fa-lock", "aria-hidden": "true" }), h("strong", {}, `Mensagem privada de ${senderName}`), close),
    preview ? h("p", { class: "private-message-text" }, preview) : null,
    open,
  );
  const dismiss = () => popup.remove();
  const timer = window.setTimeout(dismiss, POPUP_LIFETIME_MS);
  close.addEventListener("click", () => {
    window.clearTimeout(timer);
    dismiss();
  });
  open.addEventListener("click", () => {
    window.clearTimeout(timer);
    dismiss();
    openChat();
  });
  stack.append(popup);
  while (stack.childElementCount > MAX_VISIBLE_POPUPS) stack.firstElementChild?.remove();
}

/** A short chime and a popup whenever someone whispers to this user. */
export function installPrivateMessageAlert(): void {
  Hooks.on("createChatMessage", (message: any) => {
    if (!isIncomingPrivateMessage(message, game.user.id)) return;
    playChime();
    showPopup(message.alias ?? message.authorUser?.name ?? "alguém", messagePreview(message.content));
  });
}
