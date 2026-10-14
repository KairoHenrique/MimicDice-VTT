import { DOCUMENT_OWNERSHIP_LEVELS, type PlainObject } from "@tabbletop/common";
import jQuery from "jquery";
import { CONST } from "../constants";
import { Roll } from "../dice/Roll";
import { Hooks } from "../hooks/Hooks";
import { currentGame, currentUi } from "../runtime";
import { escapeHTML } from "../utils/miscUtils";
import type { DocumentOperation } from "./abstract/Document";
import { ClientDocumentMixin } from "./abstract/ClientDocumentMixin";
import { BaseChatMessage } from "./baseDocuments";

const ROLL_MODES = CONST.DICE_ROLL_MODES;

interface UserLike {
  id: string;
  isGM: boolean;
  name?: string;
  active?: boolean;
}

export interface ChatSpeaker {
  scene: string | null;
  actor: string | null;
  token: string | null;
  alias?: string;
}

function gameMasterIds(): string[] {
  return currentGame()?.users?.filter((user: UserLike) => user.isGM).map((user: UserLike) => user.id) ?? [];
}

function restoreRolls(rawRolls: unknown): Roll[] {
  if (!Array.isArray(rawRolls)) return [];
  const rolls: Roll[] = [];
  for (const rawRoll of rawRolls) {
    try {
      if (rawRoll instanceof Roll) rolls.push(rawRoll);
      else if (rawRoll && typeof rawRoll === "object") rolls.push(Roll.fromData(rawRoll as PlainObject));
    } catch (error) {
      console.warn("MimicDice | Ignoring a roll that could not be restored", error);
    }
  }
  return rolls;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(currentGame()?.i18n?.lang ?? "pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export class ChatMessage extends ClientDocumentMixin(BaseChatMessage) {
  declare rolls: Roll[];
  declare whisper: string[];
  declare blind: boolean;
  declare speaker: ChatSpeaker;
  declare content: string;
  declare flavor: string;
  declare timestamp: number;
  declare style: number;

  override _initialize(options: object = {}): void {
    super._initialize(options);
    this.rolls = restoreRolls(this.rolls);
  }

  static override canUserCreate(user: UserLike | undefined): boolean {
    return Boolean(user);
  }

  override getUserLevel(user: UserLike | undefined = currentGame()?.user): number {
    if (!user) return DOCUMENT_OWNERSHIP_LEVELS.NONE;
    if (user.isGM || this._source.author === user.id) return DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return this.#isVisibleTo(user) ? DOCUMENT_OWNERSHIP_LEVELS.OBSERVER : DOCUMENT_OWNERSHIP_LEVELS.NONE;
  }

  get authorUser(): any {
    return currentGame()?.users?.get(this._source.author) ?? null;
  }

  /** @deprecated v12 name for the author. */
  get user(): any {
    return this.authorUser;
  }

  get alias(): string {
    const speaker = this.speaker ?? ({} as ChatSpeaker);
    if (speaker.alias) return speaker.alias;
    const actor = ChatMessage.getSpeakerActor(speaker);
    return actor?.name ?? this.authorUser?.name ?? "Desconhecido";
  }

  get isAuthor(): boolean {
    return this._source.author === currentGame()?.user?.id;
  }

  get isRoll(): boolean {
    return this.rolls.length > 0;
  }

  get isContentVisible(): boolean {
    const user = currentGame()?.user;
    if (!user) return false;
    if (user.isGM) return true;
    if (this.blind) return this.whisper.includes(user.id);
    return this.#isVisibleTo(user);
  }

  override get visible(): boolean {
    const user = currentGame()?.user;
    return Boolean(user) && (user.isGM || this.isAuthor || this.#isVisibleTo(user));
  }

  get speakerActor(): any {
    return ChatMessage.getSpeakerActor(this.speaker);
  }

  override getRollData(): PlainObject {
    return this.speakerActor?.getRollData?.() ?? {};
  }

  static getSpeaker({ scene, actor, token, alias }: { scene?: any; actor?: any; token?: any; alias?: string } = {}): ChatSpeaker {
    const game = currentGame();
    const speakerActor = actor ?? token?.actor ?? game?.user?.character ?? null;
    return {
      scene: scene?.id ?? scene ?? null,
      actor: speakerActor?.id ?? null,
      token: token?.id ?? null,
      alias: alias ?? speakerActor?.name ?? game?.user?.name,
    };
  }

  static getSpeakerActor(speaker: Partial<ChatSpeaker> | null | undefined): any {
    if (!speaker?.actor) return null;
    return currentGame()?.actors?.get(speaker.actor) ?? null;
  }

  static getWhisperRecipients(name: string): UserLike[] {
    const game = currentGame();
    const normalized = String(name ?? "").trim().toLowerCase();
    if (normalized === "gm" || normalized === "mestre") return game?.users?.filter((user: UserLike) => user.isGM) ?? [];
    if (normalized === "players" || normalized === "jogadores") return game?.users?.filter((user: UserLike) => !user.isGM) ?? [];
    return game?.users?.filter((user: UserLike) => user.name?.toLowerCase() === normalized) ?? [];
  }

  /** Mutates chat data so that it is delivered according to a dice roll mode. */
  static applyRollMode(chatData: PlainObject, rollMode: string | undefined): PlainObject {
    const mode = rollMode === "roll" || !rollMode ? (currentGame()?.settings?.get?.("core", "rollMode") ?? ROLL_MODES.PUBLIC) : rollMode;
    if (mode === ROLL_MODES.PRIVATE || mode === ROLL_MODES.BLIND) chatData.whisper = gameMasterIds();
    else if (mode === ROLL_MODES.SELF) chatData.whisper = [currentGame()?.user?.id].filter(Boolean);
    else chatData.whisper = [];
    chatData.blind = mode === ROLL_MODES.BLIND;
    return chatData;
  }

  applyRollMode(rollMode: string): void {
    const changes = ChatMessage.applyRollMode({}, rollMode);
    this.updateSource({ whisper: changes.whisper, blind: changes.blind });
  }

  override async _preCreate(data: PlainObject, options: DocumentOperation, user: unknown): Promise<boolean | void> {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (typeof options.rollMode === "string") this.applyRollMode(options.rollMode);
  }

  override _onCreate(data: PlainObject, options: DocumentOperation, userId: string): void {
    super._onCreate(data, options, userId);
    void currentUi()?.chat?.postOne?.(this, { notify: true });
  }

  override _onUpdate(changed: PlainObject, options: DocumentOperation, userId: string): void {
    super._onUpdate(changed, options, userId);
    void currentUi()?.chat?.updateMessage?.(this);
  }

  override _onDelete(options: DocumentOperation, userId: string): void {
    super._onDelete(options, userId);
    currentUi()?.chat?.deleteMessage?.(this.id);
  }

  async renderHTML({ canDelete, canClose = false }: { canDelete?: boolean; canClose?: boolean } = {}): Promise<HTMLElement> {
    const user = currentGame()?.user;
    const messageData = { message: this.toObject(false), user, author: this.authorUser, alias: this.alias, isWhisper: this.whisper.length > 0, canDelete: canDelete ?? this.isOwner, canClose };
    const element = document.createElement("li");
    element.className = this.#cssClasses().join(" ");
    element.dataset.messageId = this.id ?? "";
    element.append(this.#renderHeader(messageData.canDelete, canClose), await this.#renderContent());
    Hooks.callAll("renderChatMessageHTML", this, element, messageData);
    Hooks.callAll("renderChatMessage", this, jQuery(element), messageData);
    return element;
  }

  /** @deprecated v13 replaced this with renderHTML. */
  async getHTML(): Promise<JQuery> {
    return jQuery(await this.renderHTML());
  }

  export(): string {
    const content = document.createElement("div");
    content.innerHTML = this.content ?? "";
    const rolls = this.rolls.map((roll) => `${roll.formula} = ${roll.total}`).join("; ");
    return `[${new Date(this.timestamp).toLocaleString()}] ${this.alias}\n${content.textContent ?? ""}${rolls ? `\n${rolls}` : ""}`;
  }

  #isVisibleTo(user: UserLike): boolean {
    if (user.isGM) return true;
    if (this.whisper.length === 0) return true;
    return this.whisper.includes(user.id) || this._source.author === user.id;
  }

  #cssClasses(): string[] {
    const classes = ["chat-message", "message", "flexcol"];
    if (this.whisper.length > 0) classes.push("whisper");
    if (this.blind) classes.push("blind");
    if (this.isRoll) classes.push("roll");
    if (this.style === CONST.CHAT_MESSAGE_STYLES.EMOTE) classes.push("emote");
    return classes;
  }

  #renderHeader(canDelete: boolean, canClose: boolean): HTMLElement {
    const header = document.createElement("header");
    header.className = "message-header flexrow";
    const recipients = this.whisper.map((userId) => currentGame()?.users?.get(userId)?.name).filter(Boolean).join(", ");
    header.innerHTML =
      `<h4 class="message-sender">${escapeHTML(this.alias)}</h4>` +
      `<span class="message-metadata"><time class="message-timestamp">${escapeHTML(formatTimestamp(this.timestamp))}</time>` +
      (canDelete ? `<a class="message-delete" data-action="deleteMessage" aria-label="Apagar"><i class="fa-solid fa-trash"></i></a>` : "") +
      (canClose ? `<a class="message-close" data-action="dismissMessage" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></a>` : "") +
      `</span>` +
      (recipients ? `<span class="whisper-to"><i class="fa-solid fa-lock"></i> Privado para: ${escapeHTML(recipients)}</span>` : "");
    const sender = header.querySelector<HTMLElement>(".message-sender");
    const authorColor = this.authorUser?.color;
    if (sender && typeof authorColor === "string" && /^#[0-9a-f]{6}$/i.test(authorColor)) sender.style.borderColor = authorColor;
    if (this.flavor) {
      const flavor = document.createElement("span");
      flavor.className = "flavor-text";
      flavor.innerHTML = this.flavor;
      header.append(flavor);
    }
    return header;
  }

  /** Message HTML was sanitized by the server before storage; roll cards escape their own text. */
  async #renderContent(): Promise<HTMLElement> {
    const content = document.createElement("div");
    content.className = "message-content";
    if (this.blind && !this.isContentVisible) {
      const notice = document.createElement("p");
      notice.className = "blind-notice";
      notice.textContent = "Rolagem às cegas: só o mestre vê o resultado.";
      content.append(notice);
      return content;
    }
    if (!this.isRoll) {
      content.innerHTML = this.content ?? "";
      return content;
    }
    const isPrivate = !this.isContentVisible;
    const rollTotal = this.rolls.reduce((sum, roll) => sum + (roll.total ?? 0), 0);
    const hasOwnContent = Boolean(this.content) && Number(this.content) !== rollTotal;
    const renderedRolls = await Promise.all(this.rolls.map((roll) => roll.render({ isPrivate })));
    content.innerHTML = `${hasOwnContent && !isPrivate ? this.content : ""}${renderedRolls.join("")}`;
    return content;
  }
}
