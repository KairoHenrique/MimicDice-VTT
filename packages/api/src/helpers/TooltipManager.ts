import { currentConfig, localize } from "../runtime";

const TOOLTIP_ID = "tooltip";
const MAXIMUM_TOOLTIP_LENGTH = 1000;

type TooltipDirection = "UP" | "DOWN" | "LEFT" | "RIGHT" | "CENTER";

interface TooltipOptions {
  text?: string;
  direction?: TooltipDirection;
  cssClass?: string;
  locked?: boolean;
}

/**
 * `game.tooltip`: shows `data-tooltip` text after a short hover. Tooltip content is always set as text, so
 * package- or user-provided strings can never inject markup.
 */
export class TooltipManager {
  static TOOLTIP_MARGIN_PX = 5;
  static TOOLTIP_ACTIVATION_MS = 500;
  static TOOLTIP_DIRECTIONS = Object.freeze({ UP: "UP", DOWN: "DOWN", LEFT: "LEFT", RIGHT: "RIGHT", CENTER: "CENTER" });

  static get implementation(): typeof TooltipManager {
    return (currentConfig()?.ux?.TooltipManager as typeof TooltipManager | undefined) ?? TooltipManager;
  }

  tooltip: HTMLElement | null = null;
  element: HTMLElement | null = null;
  #pendingTimeout: ReturnType<typeof setTimeout> | undefined;
  #listening = false;

  constructor() {
    if (typeof document === "undefined") return;
    this.tooltip = document.getElementById(TOOLTIP_ID) ?? this.#createTooltipElement();
  }

  #createTooltipElement(): HTMLElement {
    const element = document.createElement("aside");
    element.id = TOOLTIP_ID;
    element.setAttribute("role", "tooltip");
    element.hidden = true;
    (document.body ?? document.documentElement).append(element);
    return element;
  }

  activateEventListeners(): void {
    if (this.#listening || typeof document === "undefined") return;
    this.#listening = true;
    document.addEventListener("pointerover", (event) => {
      const target = (event.target as HTMLElement | null)?.closest?.("[data-tooltip]") as HTMLElement | null;
      if (target === this.element) return;
      clearTimeout(this.#pendingTimeout);
      if (!target) return this.deactivate();
      this.#pendingTimeout = setTimeout(() => this.activate(target), (this.constructor as typeof TooltipManager).TOOLTIP_ACTIVATION_MS);
    });
  }

  activate(element: HTMLElement, { text, direction, cssClass }: TooltipOptions = {}): void {
    if (!this.tooltip || !element?.isConnected) return;
    const content = String(text ?? element.dataset.tooltip ?? "").slice(0, MAXIMUM_TOOLTIP_LENGTH);
    if (!content) return;
    this.element = element;
    this.tooltip.textContent = localize(content);
    this.tooltip.className = `active ${cssClass ?? ""}`.trim();
    this.tooltip.hidden = false;
    this.#position(element, direction ?? (element.dataset.tooltipDirection as TooltipDirection | undefined) ?? "UP");
  }

  #position(element: HTMLElement, direction: TooltipDirection): void {
    const tooltip = this.tooltip as HTMLElement;
    const margin = (this.constructor as typeof TooltipManager).TOOLTIP_MARGIN_PX;
    const anchor = element.getBoundingClientRect();
    tooltip.style.position = "fixed";
    tooltip.style.zIndex = "10001";
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const positions: Record<TooltipDirection, [number, number]> = {
      UP: [anchor.left + anchor.width / 2 - width / 2, anchor.top - height - margin],
      DOWN: [anchor.left + anchor.width / 2 - width / 2, anchor.bottom + margin],
      LEFT: [anchor.left - width - margin, anchor.top + anchor.height / 2 - height / 2],
      RIGHT: [anchor.right + margin, anchor.top + anchor.height / 2 - height / 2],
      CENTER: [anchor.left + anchor.width / 2 - width / 2, anchor.top + anchor.height / 2 - height / 2],
    };
    const [left, top] = positions[direction] ?? positions.UP;
    tooltip.style.left = `${Math.max(0, Math.min(left, window.innerWidth - width))}px`;
    tooltip.style.top = `${Math.max(0, Math.min(top, window.innerHeight - height))}px`;
  }

  deactivate(): void {
    clearTimeout(this.#pendingTimeout);
    this.element = null;
    if (!this.tooltip) return;
    this.tooltip.hidden = true;
    this.tooltip.className = "";
  }

  clearPending(): void {
    clearTimeout(this.#pendingTimeout);
  }

  dismissLockedTooltips(): void {}

  createLockedTooltip(_position: { left?: string; top?: string }, _text: string, _options: Record<string, unknown> = {}): HTMLElement | null {
    return null;
  }
}
