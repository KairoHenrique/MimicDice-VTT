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

const DISPLAY_DURATION_MS = 5000;
const MAX_VISIBLE = 5;

export class Notifications {
  readonly #active = new Map<number, ActiveNotification>();
  #nextId = 1;
  #container: HTMLElement | undefined;

  attach(container: HTMLElement): void {
    this.#container = container;
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

    const notification = this.#createNotification(text, type, options);
    this.#active.set(notification.id, notification);
    this.#render(notification, options.escape !== false);
    this.#enforceVisibleLimit();
    if (!notification.permanent) setTimeout(() => notification.remove(), DISPLAY_DURATION_MS);
    return notification;
  }

  remove(notificationOrId: ActiveNotification | number): void {
    const id = typeof notificationOrId === "number" ? notificationOrId : notificationOrId.id;
    this.#active.get(id)?.remove();
  }

  clear(): void {
    for (const notification of Array.from(this.#active.values())) notification.remove();
  }

  #createNotification(message: string, type: NotificationType, options: NotifyOptions): ActiveNotification {
    const notification: ActiveNotification = {
      id: this.#nextId++,
      type,
      message,
      permanent: options.permanent === true,
      remove: () => {
        notification.element?.remove();
        this.#active.delete(notification.id);
      },
      update: ({ message: nextMessage }) => {
        if (nextMessage === undefined) return;
        notification.message = nextMessage;
        if (notification.element) notification.element.textContent = nextMessage;
      },
    };
    return notification;
  }

  #render(notification: ActiveNotification, escapeMessage: boolean): void {
    if (!this.#container) return;
    const element = document.createElement("li");
    element.className = `notification ${notification.type}`;
    element.dataset.notificationId = String(notification.id);
    if (escapeMessage) element.textContent = notification.message;
    else element.innerHTML = notification.message;
    element.addEventListener("click", () => notification.remove());
    this.#container.append(element);
    notification.element = element;
  }

  #enforceVisibleLimit(): void {
    const transient = Array.from(this.#active.values()).filter((notification) => !notification.permanent);
    for (const notification of transient.slice(0, Math.max(0, transient.length - MAX_VISIBLE))) notification.remove();
  }
}
