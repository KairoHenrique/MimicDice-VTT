import type { ApplicationConfiguration, RenderOptions } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DiceTray } from "../dice/DiceTray";
import { DicePool } from "../dice/DicePool";
import { buildDicePoolPanel } from "../dice/dicePoolPanel";
import { DICE_ORDERS, orderDice, readDiceOrder, saveDiceOrder, type DiceOrder } from "../dice/diceOrder";
import { combinePoolWithInput } from "../dice/rollCommands";
import { DomApplication } from "../DomApplication";
import { ChatComposer, MAX_CHAT_TEXT_LENGTH } from "./ChatComposer";
import { SIDEBAR_CONTENT_ID } from "./DocumentDirectory";

const ROLL_MODE_LABELS: Readonly<Record<string, string>> = { publicroll: "Pública", gmroll: "Só o mestre", blindroll: "Às cegas", selfroll: "Só eu" };
const DICE_SO_NICE_ID = "dice-so-nice";

/** Foundry's chat (`ui.chat`): rolls, text messages and whispers, plus the ChatLog methods packages call. */
export class ChatLog extends DomApplication {
  static tabName = "chat";
  static tabLabel = "Chat";
  static tabIcon = "fa-solid fa-comments";

  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "chat",
    classes: ["chat-sidebar", "sidebar-tab", "tab", "directory"],
    tag: "section",
    window: { frame: false, positioned: false, title: "", icon: false, controls: [], minimizable: false, resizable: false, contentTag: "section", contentClasses: [] },
  };

  readonly #tray = new DiceTray();
  readonly #pool = new DicePool();
  #composer: ChatComposer | null = null;
  #log: HTMLOListElement | null = null;
  #diceOrder: DiceOrder = readDiceOrder();
  #unread = 0;

  get tabName(): string {
    return ChatLog.tabName;
  }

  get collection(): any {
    return game.messages;
  }

  override _insertElement(element: HTMLElement): void {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else (document.getElementById(SIDEBAR_CONTENT_ID) ?? document.body).append(element);
  }

  buildContent(): Node[] {
    this.#log = h("ol", { id: "chat-log", class: "chat-log", "aria-live": "polite" });
    this.#log.addEventListener("click", (event) => void this.#onLogClick(event));
    const filter = h("div", { class: "chat-filter" }, h("i", { class: "fa-solid fa-arrow-down-wide-short", "aria-hidden": "true" }), this.#buildDiceOrderSelect());
    return [filter, this.#log, this.#buildRollForm()];
  }

  override async _onRender(context: object, options: RenderOptions): Promise<void> {
    await super._onRender(context, options);
    const messages = (this.collection?.contents ?? []).filter((message: any) => message.visible);
    messages.sort((left: any, right: any) => left.timestamp - right.timestamp);
    const elements = await Promise.all(messages.map((message: any) => this.#renderMessage(message)));
    this.#log?.replaceChildren(...elements);
    this.scrollBottom();
  }

  async #renderMessage(message: any): Promise<HTMLElement> {
    const element: HTMLElement = await message.renderHTML();
    orderDice(element, this.#diceOrder);
    return element;
  }

  async postOne(message: any, { before, notify = false }: { before?: string; notify?: boolean } = {}): Promise<void> {
    if (!this.#log || !message.visible) return;
    const element = await this.#renderMessage(message);
    const anchor = before ? this.#log.querySelector(`[data-message-id="${CSS.escape(before)}"]`) : null;
    const shouldAnimate = notify && message.isRoll && message.isContentVisible && this.#builtInAnimationEnabled();
    if (shouldAnimate) element.classList.add("rolling");
    if (anchor) anchor.before(element);
    else this.#log.append(element);
    this.scrollBottom();
    if (notify) this.#markUnread();
    if (shouldAnimate) {
      await this.#tray.show(message.rolls, message.authorUser?.color);
      element.classList.remove("rolling");
    }
  }

  async updateMessage(message: any): Promise<void> {
    const existing = this.#log?.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (!existing) return this.postOne(message);
    existing.replaceWith(await this.#renderMessage(message));
  }

  deleteMessage(messageId: string): void {
    this.#log?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.remove();
  }

  scrollBottom(): void {
    if (this.#log) this.#log.scrollTop = this.#log.scrollHeight;
  }

  /** Packages call this after revealing a delayed message (e.g. once a 3D dice animation ends). */
  notify(_message?: unknown): void {
    this.#markUnread();
  }

  /** Called by the sidebar when this tab becomes visible. */
  clearUnread(): void {
    this.#unread = 0;
    this.#updateBadge();
  }

  async processMessage(input: string): Promise<boolean> {
    this.#composer ??= new ChatComposer();
    return this.#composer.send(input, game.settings.get("core", "rollMode"));
  }

  #builtInAnimationEnabled(): boolean {
    if (game.modules.get(DICE_SO_NICE_ID)?.active) return false;
    return game.settings.get("core", "diceAnimation") !== false;
  }

  #markUnread(): void {
    if (ui.sidebar?.activeTab === ChatLog.tabName) return;
    this.#unread += 1;
    this.#updateBadge();
  }

  #updateBadge(): void {
    const tab = document.querySelector<HTMLElement>(`.sidebar-tabs [data-tab="${ChatLog.tabName}"]`);
    if (!tab) return;
    tab.dataset.unread = this.#unread > 0 ? String(Math.min(this.#unread, 99)) : "";
  }

  #buildRollForm(): HTMLElement {
    this.#composer = new ChatComposer();
    const formulaInput = h("input", { type: "text", name: "formula", placeholder: "Mensagem, 1d20 + 5 ou /w Nome texto", autocomplete: "off", maxlength: MAX_CHAT_TEXT_LENGTH, "aria-label": "Mensagem ou fórmula de rolagem" });
    const modeSelect = h("select", { name: "rollMode", "aria-label": "Quem vê a rolagem" });
    const currentMode = game.settings.get("core", "rollMode");
    for (const [mode, label] of Object.entries(ROLL_MODE_LABELS)) modeSelect.append(h("option", { value: mode, selected: mode === currentMode }, label));
    modeSelect.addEventListener("change", () => void game.settings.set("core", "rollMode", modeSelect.value));

    const rollButton = h("button", { type: "submit", class: "roll-submit", title: "Enviar a mensagem ou rolar os dados" }, h("i", { class: "fa-solid fa-paper-plane" }), " Enviar");
    const poolPanel = buildDicePoolPanel(this.#pool, rollButton);
    const form = h("form", { class: "roll-form" });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const poolFormula = this.#pool.toFormula();
      const message = combinePoolWithInput(poolFormula, formulaInput.value);
      const sent = await this.#composer?.send(message, game.settings.get("core", "rollMode"), { rollOnly: Boolean(poolFormula) });
      if (!sent) return;
      formulaInput.value = "";
      this.#pool.clear();
      poolPanel.refresh();
    });
    const messageRow = h("div", { class: "roll-form-row message-row" }, formulaInput, rollButton);
    const audienceRow = h("div", { class: "roll-form-row audience-row" }, this.#composer.recipientSelect, modeSelect);
    if (game.user.isGM) {
      const clear = h("button", { type: "button", class: "icon", title: "Apagar todo o chat", "aria-label": "Apagar todo o chat" }, h("i", { class: "fa-solid fa-trash" }));
      clear.addEventListener("click", () => void this.#confirmFlush());
      audienceRow.append(clear);
    }
    form.append(poolPanel.element, messageRow, audienceRow);
    return form;
  }

  #buildDiceOrderSelect(): HTMLSelectElement {
    const select = h("select", { name: "diceOrder", class: "dice-order", "aria-label": "Ordem dos dados no chat", title: "Ordem dos dados no chat" });
    for (const [order, label] of Object.entries(DICE_ORDERS)) select.append(h("option", { value: order, selected: order === this.#diceOrder }, label));
    select.addEventListener("change", () => {
      this.#diceOrder = select.value === "rolled" ? "rolled" : "highest";
      saveDiceOrder(this.#diceOrder);
      if (this.#log) orderDice(this.#log, this.#diceOrder);
    });
    return select;
  }

  async #confirmFlush(): Promise<void> {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Apagar chat" },
      content: "<p>Apagar todas as mensagens e rolagens de todos? Essa ação não pode ser desfeita.</p>",
    });
    if (confirmed) await this.collection.flush();
  }

  async #onLogClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const messageElement = target.closest<HTMLElement>("[data-message-id]");
    const message = messageElement ? this.collection.get(messageElement.dataset.messageId) : null;
    if (!message) return;
    if (target.closest("[data-action=deleteMessage]")) {
      await message.delete();
      return;
    }
    const rollCard = target.closest<HTMLElement>(".dice-roll");
    if (rollCard) rollCard.classList.toggle("expanded");
  }
}
