import { currentUi } from "../runtime";

const STYLE_SELECTOR = 'link[rel="stylesheet"], style';
const POPPED_OUT_CLASS = "popped-out";
const MIN_POPUP_WIDTH = 320;
const MIN_POPUP_HEIGHT = 240;
const STYLE_LOAD_TIMEOUT_MS = 3_000;

export interface PoppedOutWindow {
  /** Brings the element back to the table and closes the separate window. */
  close(): void;
}

export interface PopOutOptions {
  name: string;
  title: string;
  onReturn: () => void;
}

function popupFeatures(element: HTMLElement): string {
  const rect = element.getBoundingClientRect();
  const width = Math.max(MIN_POPUP_WIDTH, Math.round(rect.width));
  const height = Math.max(MIN_POPUP_HEIGHT, Math.round(rect.height));
  const left = Math.round(window.screenX + rect.left);
  const top = Math.round(window.screenY + rect.top);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

/** The blank window gets the table's stylesheets and theme classes so the moved element looks the same. */
function prepareDocument(popup: Window, title: string): void {
  const target = popup.document;
  target.title = title;
  const base = target.createElement("base");
  base.href = `${window.location.origin}/`;
  target.head.append(base);
  const pendingSheets: Promise<unknown>[] = [];
  for (const sheet of document.querySelectorAll(STYLE_SELECTOR)) {
    const copy = target.importNode(sheet, true);
    if (copy.nodeName === "LINK") {
      pendingSheets.push(
        new Promise((resolve) => {
          copy.addEventListener("load", resolve);
          copy.addEventListener("error", resolve);
        }),
      );
    }
    target.head.append(copy);
  }
  target.documentElement.lang = document.documentElement.lang;
  target.documentElement.className = document.documentElement.className;
  const rootStyle = document.documentElement.getAttribute("style");
  if (rootStyle) target.documentElement.setAttribute("style", rootStyle);
  target.body.className = `${document.body.className} popout-body`.trim();
  hideUntilStyled(target.body, pendingSheets);
}

/** Keeps the window blank until its stylesheets arrive, so it never flashes unstyled. */
function hideUntilStyled(body: HTMLElement, pendingSheets: Promise<unknown>[]): void {
  if (pendingSheets.length === 0) return;
  body.style.visibility = "hidden";
  const reveal = () => body.style.removeProperty("visibility");
  void Promise.race([Promise.all(pendingSheets), new Promise((resolve) => setTimeout(resolve, STYLE_LOAD_TIMEOUT_MS))]).then(reveal);
}

/**
 * Moves an open window of the table into a real browser window, which the OS lets the user drag to another
 * monitor. The same element (with its listeners) is moved, so the sheet keeps working and saving as before.
 */
export function popOutElement(element: HTMLElement, options: PopOutOptions): PoppedOutWindow | null {
  if (!element.isConnected) return null;
  const popup = window.open("", options.name, popupFeatures(element));
  if (!popup) {
    currentUi()?.notifications?.warn("Não deu para abrir a janela separada. Libere pop-ups para esta página.");
    return null;
  }
  prepareDocument(popup, options.title);
  const savedStyle = element.getAttribute("style");
  const marker = document.createComment("popped-out");
  element.replaceWith(marker);
  element.classList.add(POPPED_OUT_CLASS);
  element.removeAttribute("style");
  popup.document.body.append(popup.document.adoptNode(element));

  let returned = false;
  const bringBack = () => {
    if (returned) return;
    returned = true;
    element.classList.remove(POPPED_OUT_CLASS);
    if (element.isConnected && element.ownerDocument === popup.document) {
      const home = document.adoptNode(element);
      if (marker.isConnected) marker.replaceWith(home);
      else document.body.append(home);
      if (savedStyle === null) home.removeAttribute("style");
      else home.setAttribute("style", savedStyle);
    }
    marker.remove();
    options.onReturn();
  };
  popup.addEventListener("pagehide", bringBack);
  window.addEventListener("pagehide", () => popup.close(), { once: true });
  popup.focus();
  return {
    close: () => {
      bringBack();
      popup.close();
    },
  };
}
