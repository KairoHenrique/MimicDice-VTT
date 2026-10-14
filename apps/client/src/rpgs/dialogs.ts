import type { RpgFolderTreeNode } from "@tabbletop/protocol";
import { h } from "../views/dom";

interface ModalButton<T> {
  label: string;
  value: T;
  variant?: "primary" | "danger";
}

/** Shows a native modal <dialog> and resolves with the chosen button value (or `fallback` on Esc). */
function openModal<T>(title: string, body: Node[], buttons: ModalButton<T>[], fallback: T, onOpen?: (dialog: HTMLDialogElement) => void): Promise<T> {
  return new Promise((resolve) => {
    let result = fallback;
    const footer = h("footer", { class: "modal-actions" });
    const dialog = h("dialog", { class: "modal" }, h("h2", {}, title), ...body, footer);
    for (const button of buttons) {
      const element = h("button", { type: "button", class: button.variant ?? "" }, button.label);
      element.addEventListener("click", () => {
        result = button.value;
        dialog.close();
      });
      footer.append(element);
    }
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    onOpen?.(dialog);
  });
}

export async function promptName(title: string, initialValue = "", confirmLabel = "Salvar"): Promise<string | null> {
  const input = h("input", { type: "text", value: initialValue, maxlength: 120, "aria-label": title, class: "modal-input" });
  const accepted = await openModal(title, [input], [{ label: "Cancelar", value: false }, { label: confirmLabel, value: true, variant: "primary" }], false, (dialog) => {
    input.focus();
    const dotIndex = initialValue.lastIndexOf(".");
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : initialValue.length);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      (dialog.querySelector(".modal-actions .primary") as HTMLButtonElement | null)?.click();
    });
  });
  const value = input.value.trim();
  return accepted && value ? value : null;
}

export function confirmDanger(title: string, message: string, confirmLabel = "Apagar"): Promise<boolean> {
  return openModal(title, [h("p", { class: "modal-message" }, message)], [{ label: "Cancelar", value: false }, { label: confirmLabel, value: true, variant: "danger" }], false);
}

function buildTreeList(node: RpgFolderTreeNode, excludedPath: string, onPick: (path: string, element: HTMLElement) => void): HTMLUListElement {
  const list = h("ul", { class: "folder-tree" });
  for (const child of node.children) {
    if (child.path === excludedPath || child.path.startsWith(`${excludedPath}/`)) continue;
    const label = h("button", { type: "button", class: "folder-tree-item" }, h("i", { class: "fa-solid fa-folder" }), ` ${child.name}`);
    label.addEventListener("click", () => onPick(child.path, label));
    const item = h("li", {}, label);
    if (child.children.length > 0) item.append(buildTreeList(child, excludedPath, onPick));
    list.append(item);
  }
  return list;
}

/** Folder picker for "Mover para..."; resolves with the destination path ("" is the world root) or null. */
export async function pickFolder(tree: RpgFolderTreeNode, rootName: string, movingPath: string): Promise<string | null> {
  let selected: string | null = null;
  const onPick = (path: string, element: HTMLElement) => {
    selected = path;
    element.closest(".folder-tree-root")?.querySelectorAll(".folder-tree-item.selected").forEach((other) => other.classList.remove("selected"));
    element.classList.add("selected");
  };
  const rootButton = h("button", { type: "button", class: "folder-tree-item" }, h("i", { class: "fa-solid fa-house" }), ` ${rootName}`);
  rootButton.addEventListener("click", () => onPick("", rootButton));
  const container = h("div", { class: "folder-tree-root" }, rootButton, buildTreeList(tree, movingPath, onPick));
  const accepted = await openModal("Mover para...", [container], [{ label: "Cancelar", value: false }, { label: "Mover aqui", value: true, variant: "primary" }], false);
  return accepted ? selected : null;
}
