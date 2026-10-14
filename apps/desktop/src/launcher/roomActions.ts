import { t } from "@tabbletop/i18n";
import type { RoomSummary, RoomsResult } from "../ipcChannels";

export interface RoomActionHandlers {
  rename(room: RoomSummary, title: string, password: string): Promise<RoomsResult<{ id: string }>>;
  remove(room: RoomSummary, password: string): Promise<RoomsResult<{ id: string }>>;
  /** Called after a successful change so the list is drawn again. */
  changed(): Promise<void>;
}

interface PasswordDialogOptions {
  title: string;
  text: string;
  confirmLabel: string;
  danger: boolean;
  /** When set, the dialog also asks for a new name starting from this value. */
  initialName?: string;
  /** Returns an error message to keep the dialog open, or null when done. */
  submit(name: string, password: string): Promise<string | null>;
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Elemento ausente: ${id}`);
  return found as T;
}

let closeOpenMenu: (() => void) | null = null;

/** The "..." button next to a room, with rename and delete; both ask for that room's Game Master password. */
export function buildRoomMenu(room: RoomSummary, handlers: RoomActionHandlers): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "room-menu";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "icon-button room-menu-toggle";
  toggle.textContent = "⋯";
  toggle.setAttribute("aria-label", t(`Mais opções da sala ${room.title}`));
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "room-menu-list";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  const renameItem = menuItem(t("Trocar nome"), () => openRenameDialog(room, handlers));
  const deleteItem = menuItem(t("Excluir"), () => openDeleteDialog(room, handlers));
  deleteItem.classList.add("danger");
  if (room.active) {
    deleteItem.disabled = true;
    deleteItem.title = t("Abra outra sala antes de excluir esta.");
  }
  menu.append(renameItem, deleteItem);

  const close = () => {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    document.removeEventListener("keydown", onKey, true);
    if (closeOpenMenu === close) closeOpenMenu = null;
  };
  const onOutsidePointer = (event: PointerEvent) => {
    if (!wrapper.contains(event.target as Node)) close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    close();
    toggle.focus();
  };
  toggle.addEventListener("click", () => {
    if (!menu.hidden) return close();
    closeOpenMenu?.();
    closeOpenMenu = close;
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutsidePointer, true);
    document.addEventListener("keydown", onKey, true);
    renameItem.focus();
  });
  menu.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button")) close();
  });
  wrapper.append(toggle, menu);
  return wrapper;
}

function menuItem(label: string, action: () => void): HTMLButtonElement {
  const item = document.createElement("button");
  item.type = "button";
  item.setAttribute("role", "menuitem");
  item.textContent = label;
  item.addEventListener("click", action);
  return item;
}

function openRenameDialog(room: RoomSummary, handlers: RoomActionHandlers): void {
  openPasswordDialog({
    title: t("Trocar o nome da sala"),
    text: t(`Novo nome para "${room.title}". As fichas, cenas e arquivos continuam iguais.`),
    confirmLabel: t("Salvar nome"),
    danger: false,
    initialName: room.title,
    submit: async (name, password) => {
      const title = name.trim();
      if (!title) return t("Digite um nome.");
      if (title === room.title) return null;
      return finish(await handlers.rename(room, title, password), handlers);
    },
  });
}

function openDeleteDialog(room: RoomSummary, handlers: RoomActionHandlers): void {
  openPasswordDialog({
    title: t(`Excluir a sala "${room.title}"?`),
    text: t("Personagens, cenas, chat e jogadores dessa sala serão apagados e não dá para desfazer. A pasta de arquivos (mapas e imagens) continua em rpgs."),
    confirmLabel: t("Excluir para sempre"),
    danger: true,
    submit: async (_name, password) => finish(await handlers.remove(room, password), handlers),
  });
}

async function finish(result: RoomsResult<{ id: string }>, handlers: RoomActionHandlers): Promise<string | null> {
  if (!result.ok) return result.error;
  await handlers.changed();
  return null;
}

function openPasswordDialog(options: PasswordDialogOptions): void {
  const dialog = element<HTMLDialogElement>("room-dialog");
  const form = element<HTMLFormElement>("room-dialog-form");
  const nameField = element("room-dialog-name-field");
  const nameInput = element<HTMLInputElement>("room-dialog-name");
  const passwordInput = element<HTMLInputElement>("room-dialog-password");
  const errorText = element("room-dialog-error");
  const confirm = element<HTMLButtonElement>("room-dialog-confirm");
  const cancel = element<HTMLButtonElement>("room-dialog-cancel");

  element("room-dialog-title").textContent = options.title;
  element("room-dialog-text").textContent = options.text;
  nameField.hidden = options.initialName === undefined;
  nameInput.value = options.initialName ?? "";
  passwordInput.value = "";
  errorText.hidden = true;
  confirm.textContent = options.confirmLabel;
  confirm.className = options.danger ? "danger" : "accent";
  confirm.disabled = false;

  const showError = (message: string | null) => {
    errorText.hidden = !message;
    errorText.textContent = message ?? "";
  };
  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    confirm.disabled = true;
    try {
      const error = await options.submit(nameInput.value, passwordInput.value);
      if (error === null) return dialog.close();
      showError(error);
      passwordInput.select();
    } finally {
      confirm.disabled = false;
    }
  };
  const onCancel = () => dialog.close();
  dialog.addEventListener(
    "close",
    () => {
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      passwordInput.value = "";
    },
    { once: true },
  );
  form.addEventListener("submit", onSubmit);
  cancel.addEventListener("click", onCancel);
  dialog.showModal();
  (options.initialName === undefined ? passwordInput : nameInput).focus();
}
