import { CONST, escapeHTML } from "@tabbletop/api";
import { h } from "../../views/dom";
import { parseRollCommand } from "../dice/rollCommands";
import { isWhisperCommand, parseWhisperCommand, type WhisperUser } from "./whisperCommand";

const EVERYONE = "all";
const GAME_MASTERS = "gm";
export const MAX_CHAT_TEXT_LENGTH = 2000;
/** Without a /r prefix, only text with dice notation rolls, so answering "2" in the chat stays a message. */
const DICE_NOTATION = /(?:^|[^a-z])\d*d(?:\d|%|f\b)/i;

function knownUsers(): WhisperUser[] {
  return (game.users?.contents ?? []).map((user: any) => ({ id: user.id, name: String(user.name ?? ""), isGM: user.isGM === true }));
}

function gameMasterIds(): string[] {
  return knownUsers()
    .filter((user) => user.isGM)
    .map((user) => user.id);
}

/**
 * Turns what the user typed into a chat message: dice formulas roll, `/w` whispers, anything else is text.
 * The recipient picker makes any message (including rolls) private to the chosen people; GMs always see it.
 */
export class ChatComposer {
  readonly recipientSelect = h("select", { name: "recipient", class: "chat-recipient", "aria-label": "Para quem vai a mensagem" });

  constructor() {
    this.refreshRecipients();
    this.recipientSelect.addEventListener("focus", () => this.refreshRecipients());
    this.recipientSelect.addEventListener("change", () => this.recipientSelect.classList.toggle("private", this.recipientSelect.value !== EVERYONE));
  }

  refreshRecipients(): void {
    const selected = this.recipientSelect.value || EVERYONE;
    const options = [h("option", { value: EVERYONE }, "Todos")];
    if (!game.user.isGM) options.push(h("option", { value: GAME_MASTERS }, "Só o mestre"));
    for (const user of knownUsers()) {
      if (user.id === game.user.id) continue;
      options.push(h("option", { value: user.id }, `Privado: ${user.name}`));
    }
    this.recipientSelect.replaceChildren(...options);
    this.recipientSelect.value = options.some((option) => option.value === selected) ? selected : EVERYONE;
    this.recipientSelect.classList.toggle("private", this.recipientSelect.value !== EVERYONE);
  }

  /** Recipient ids from the picker, or null when the message goes to everyone. */
  selectedRecipients(): string[] | null {
    const value = this.recipientSelect.value;
    if (!value || value === EVERYONE) return null;
    if (value === GAME_MASTERS) return gameMasterIds();
    return game.users.get(value) ? [value] : null;
  }

  /** Returns true when something was sent, so the caller can clear the input. */
  async send(input: string, rollMode: string, { rollOnly = false }: { rollOnly?: boolean } = {}): Promise<boolean> {
    const text = input.trim();
    if (!text) return false;
    if (this.selectedRecipients()?.length === 0) {
      ui.notifications.warn("Não há ninguém para receber essa mensagem privada.");
      return false;
    }
    const command = parseRollCommand(text);
    const meantAsRoll = rollOnly || text.startsWith("/") || DICE_NOTATION.test(command?.formula ?? "");
    if (command && meantAsRoll && Roll.validate(command.formula)) return this.#sendRoll(command, rollMode);
    if (rollOnly) {
      ui.notifications.warn("Fórmula inválida. Exemplo: 1d20 + 5 ou 2d6kh.");
      return false;
    }
    if (isWhisperCommand(text)) return this.#sendWhisperCommand(text);
    if (text.startsWith("/")) {
      ui.notifications.warn("Comando desconhecido. Use /r, /gmr, /br, /sr ou /w Nome mensagem.");
      return false;
    }
    return this.#sendText(text, this.selectedRecipients() ?? []);
  }

  async #sendWhisperCommand(text: string): Promise<boolean> {
    const parsed = parseWhisperCommand(text, knownUsers(), game.user.id);
    if ("error" in parsed) {
      ui.notifications.warn(parsed.error);
      return false;
    }
    return this.#sendText(parsed.text, parsed.recipientIds);
  }

  async #sendText(text: string, whisper: string[]): Promise<boolean> {
    if (text.length > MAX_CHAT_TEXT_LENGTH) {
      ui.notifications.warn(`Mensagem muito longa (máximo de ${MAX_CHAT_TEXT_LENGTH} caracteres).`);
      return false;
    }
    const content = `<p>${escapeHTML(text).replace(/\n/g, "<br>")}</p>`;
    const created = await ChatMessage.create({ author: game.user.id, content, style: CONST.CHAT_MESSAGE_STYLES.OOC, speaker: { scene: null, actor: null, token: null, alias: game.user.name }, whisper });
    return Boolean(created);
  }

  /** Public and GM-only rolls can be addressed to someone; self and blind rolls keep their own audience. */
  async #sendRoll(command: { formula: string; flavor: string; rollMode: string | null }, selectedMode: string): Promise<boolean> {
    const actor = game.user.character ?? null;
    const rollMode = command.rollMode ?? selectedMode;
    const roll = Roll.create(command.formula, actor?.getRollData?.() ?? {});
    await roll.evaluate();
    const speaker = ChatMessage.getSpeaker({ actor: actor ?? undefined });
    const recipients = this.selectedRecipients();
    const addressable = rollMode === CONST.DICE_ROLL_MODES.PUBLIC || rollMode === CONST.DICE_ROLL_MODES.PRIVATE;
    if (!recipients || !addressable) return Boolean(await roll.toMessage({ speaker, flavor: command.flavor }, { rollMode }));
    const data = (await roll.toMessage({ speaker, flavor: command.flavor }, { rollMode, create: false })) as Record<string, unknown>;
    const audience = rollMode === CONST.DICE_ROLL_MODES.PRIVATE ? [...recipients, ...gameMasterIds()] : recipients;
    data.whisper = [...new Set(audience)];
    return Boolean(await ChatMessage.create(data));
  }
}
