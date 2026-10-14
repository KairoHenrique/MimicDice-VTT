import { h } from "../views/dom";

const TOAST_LIFETIME_MS = 3500;
const container = h("ol", { class: "toasts", "aria-live": "polite" });

export function mountToasts(): void {
  if (!container.isConnected) document.body.append(container);
}

export function showToast(message: string, kind: "info" | "error" = "info"): void {
  const toast = h("li", { class: `toast ${kind}` }, h("i", { class: kind === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check" }), ` ${message}`);
  container.append(toast);
  setTimeout(() => toast.remove(), TOAST_LIFETIME_MS);
}
