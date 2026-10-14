import { localize } from "../runtime";

type NotificationType = "info" | "warning" | "error" | "success";

interface NotifyOptions {
  permanent?: boolean;
  localize?: boolean;
  console?: boolean;
  escape?: boolean;
  format?: Record<string, unknown>;
}

export interface ActiveNotification {
  id: number;
  type: NotificationType;
  message: string;
  permanent: boolean;
  element?: HTMLElement;
  remove(): void;
  update(changes: { message?: string }): void;
}

interface NotificationState {
  notification: ActiveNotification;
  repeatCount: number;
  dismissTimer?: ReturnType<typeof setTimeout>;
}

const DISPLAY_DURATION_MS = 5000;
const MAX_VISIBLE = 3;

export class Notifications {
  readonly #active = new Map<number, NotificationState>();
  #nextId = 1;
  #container: HTMLElement | undefined;

  attach(container: HTMLElement): void {
    this.#container = container;
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-relevant", "additions text");
  }

  info(message: string, options: NotifyOptions = {}): ActiveNotification {
    return this.notify(message, "info", options);
  }

  warn(message: string, options: NotifyOptions = {}): ActiveNotification {
    return this.notify(message, "warning", options);
  }

  error(message: string, options: NotifyOptions = {}): ActiveNotification {
    return this.notify(message, "error", options);
  }

  success(message: string, options: NotifyOptions = {}): ActiveNotification {
    return this.notify(message, "success", options);
  }

  notify(message: string, type: NotificationType = "info", options: NotifyOptions = {}): ActiveNotification {
    let text = options.localize ? localize(message) : String(message);
    if (options.format) text = text.replace(/{[^}]+}/g, (placeholder) => String(options.format?.[placeholder.slice(1, -1)] ?? placeholder));
    if (options.console !== false) console[type === "error" ? "error" : type === "warning" ? "warn" : "info"](`MimicDice | ${text}`);

    const repeated = this.#findRepeat(text, type, options);
    if (repeated) return this.#repeat(repeated);

    const state: NotificationState = { notification: this.#createNotification(text, type, options), repeatCount: 1 };
    this.#active.set(state.notification.id, state);
    this.#render(state.notification, options.escape !== false);
    this.#enforceVisibleLimit();
    this.#scheduleDismiss(state);
    return state.notification;
  }

  remove(notificationOrId: ActiveNotification | number): void {
    const id = typeof notificationOrId === "number" ? notificationOrId : notificationOrId.id;
    this.#active.get(id)?.notification.remove();
  }

  clear(): void {
    for (const state of Array.from(this.#active.values())) state.notification.remove();
  }

  /** The same transient message shown again only bumps a counter on the card already on screen. */
  #findRepeat(text: string, type: NotificationType, options: NotifyOptions): NotificationState | undefined {
    if (options.permanent) return undefined;
    for (const state of this.#active.values()) {
      const { notification } = state;
      if (!notification.permanent && notification.type === type && notification.message === text) return state;
    }
    return undefined;
  }

  #repeat(state: NotificationState): ActiveNotification {
    state.repeatCount += 1;
    const element = state.notification.element;
    if (element) {
      let badge = element.querySelector<HTMLElement>(".notification-count");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "notification-count";
        element.append(badge);
      }
      badge.textContent = `×${state.repeatCount}`;
      badge.setAttribute("aria-label", `${state.repeatCount} vezes`);
    }
    this.#scheduleDismiss(state);
    return state.notification;
  }

  #scheduleDismiss(state: NotificationState): void {
    if (state.notification.permanent) return;
    if (state.dismissTimer !== undefined) clearTimeout(state.dismissTimer);
    state.dismissTimer = setTimeout(() => state.notification.remove(), DISPLAY_DURATION_MS);
  }

  #createNotification(message: string, type: NotificationType, options: NotifyOptions): ActiveNotification {
    const notification: ActiveNotification = {
      id: this.#nextId++,
      type,
      message,
      permanent: options.permanent === true,
      remove: () => {
        const state = this.#active.get(notification.id);
        if (state?.dismissTimer !== undefined) clearTimeout(state.dismissTimer);
        notification.element?.remove();
        this.#active.delete(notification.id);
      },
      update: ({ message: nextMessage }) => {
        if (nextMessage === undefined) return;
        notification.message = nextMessage;
        const text = notification.element?.querySelector(".notification-text");
        if (text) text.textContent = nextMessage;
      },
    };
    return notification;
  }

  #render(notification: ActiveNotification, escapeMessage: boolean): void {
    if (!this.#container) return;
    const element = document.createElement("li");
    element.className = `notification ${notification.type}`;
    element.dataset.notificationId = String(notification.id);
    element.setAttribute("role", notification.type === "error" ? "alert" : "status");
    element.title = "Clique para fechar";
    const text = document.createElement("span");
    text.className = "notification-text";
    if (escapeMessage) text.textContent = notification.message;
    else text.innerHTML = notification.message;
    element.append(text);
    element.addEventListener("click", () => notification.remove());
    this.#container.append(element);
    notification.element = element;
  }

  #enforceVisibleLimit(): void {
    const transient = Array.from(this.#active.values()).filter((state) => !state.notification.permanent);
    for (const state of transient.slice(0, Math.max(0, transient.length - MAX_VISIBLE))) state.notification.remove();
  }
}
