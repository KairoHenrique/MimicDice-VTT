import { imageTileDragData } from "../../canvas/interaction/imageTileDrop";
import type { FilePickerBrowseResult, FilePickerType } from "./FilePicker";

export interface FilePickerViewModel {
  result: FilePickerBrowseResult;
  selectedPath: string;
  type: FilePickerType;
  canUpload: boolean;
  /** Folder browser with no "Selecionar" step: double click opens the file instead. */
  browseOnly: boolean;
  toUrl: (path: string) => string;
}

export interface FilePickerViewHandlers {
  navigate(path: string): void;
  select(path: string): void;
  confirm(path: string): void;
  upload(files: readonly File[]): void;
  /** Files/folders from Windows (or a folder picker), keeping relative subfolders. */
  uploadRelative(files: FileList | readonly File[], fromFolderPicker?: boolean): void;
  uploadDataTransfer(dataTransfer: DataTransfer): void;
  createFolder(name: string): void;
  deletePaths(paths: readonly string[]): void;
  share(path: string, shared: boolean): void;
  createNote(): void;
}

const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const VIDEO_PATTERN = /\.(webm|mp4|m4v)$/i;
const AUDIO_PATTERN = /\.(mp3|ogg|oga|wav|flac|m4a)$/i;
const PDF_PATTERN = /\.pdf$/i;
const NOTE_PATTERN = /\.(md|txt)$/i;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

function iconButton(icon: string, label: string, onClick: () => void, className = "file-picker-button"): HTMLButtonElement {
  const button = element("button", className);
  button.type = "button";
  button.append(element("i", icon), document.createTextNode(` ${label}`));
  button.addEventListener("click", onClick);
  return button;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

const UPLOADS_ROOT = "uploads";
const TABLE_SHARED_PATH = "uploads/compartilhado";

function buildToolbar(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const toolbar = element("div", "file-picker-toolbar");
  const target = model.result.target;
  const parent = model.result.parent === undefined ? target.split("/").slice(0, -1).join("/") : model.result.parent;
  const upButton = iconButton("fa-solid fa-arrow-up", "Voltar", () => handlers.navigate(parent ?? ""));
  upButton.disabled = target === "" || parent === null;
  const label = model.result.labels?.[target];
  const breadcrumb = element("span", "file-picker-path", label ?? `/${target}`);
  breadcrumb.title = `/${target}`;
  toolbar.append(upButton, breadcrumb);
  // Quick jumps so "Selecionar arquivo" always reaches the GM handout folder and the uploads root.
  if (target.startsWith(UPLOADS_ROOT) || target === "") {
    const shared = iconButton("fa-solid fa-share-nodes", "Pasta do mestre", () => handlers.navigate(TABLE_SHARED_PATH), "file-picker-button file-picker-jump");
    shared.title = "Abrir a pasta do mestre (arquivos compartilhados com a mesa)";
    shared.disabled = target === TABLE_SHARED_PATH || target.startsWith(`${TABLE_SHARED_PATH}/`);
    const uploads = iconButton("fa-solid fa-hard-drive", "Uploads", () => handlers.navigate(UPLOADS_ROOT), "file-picker-button file-picker-jump");
    uploads.title = "Voltar à raiz de uploads";
    uploads.disabled = target === UPLOADS_ROOT;
    toolbar.append(shared, uploads);
  }
  return toolbar;
}

function shareToggle(path: string, shared: boolean, handlers: FilePickerViewHandlers): HTMLButtonElement {
  const label = shared ? "Visível para o grupo. Clique para deixar só para você" : "Só você (e o mestre) vê. Clique para mostrar ao grupo";
  const button = element("button", "file-picker-share");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(shared));
  const icon = element("i", shared ? "fa-solid fa-users" : "fa-solid fa-lock");
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.share(path, !shared);
  });
  return button;
}

function deleteEntryButton(path: string, handlers: FilePickerViewHandlers): HTMLButtonElement {
  const button = element("button", "file-picker-delete");
  button.type = "button";
  button.title = "Apagar";
  button.setAttribute("aria-label", `Apagar ${baseName(path)}`);
  button.append(element("i", "fa-solid fa-trash"));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.deletePaths([path]);
  });
  return button;
}

function buildDirectoryEntry(path: string, model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const entry = element("li", "file-picker-entry directory");
  entry.title = path;
  entry.dataset.filePath = path;
  entry.classList.toggle("selected", path === model.selectedPath);
  entry.append(element("i", "fa-solid fa-folder"), element("span", "file-picker-name", model.result.labels?.[path] ?? baseName(path)));
  const shared = model.result.shareable?.[path];
  if (shared !== undefined) entry.append(shareToggle(path, shared, handlers));
  if (model.canUpload) entry.append(deleteEntryButton(path, handlers));
  entry.addEventListener("click", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      handlers.select(path);
      return;
    }
    handlers.navigate(path);
  });
  entry.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    handlers.select(path);
  });
  return entry;
}

function buildFilePreview(path: string, model: FilePickerViewModel): HTMLElement {
  if (IMAGE_PATTERN.test(path)) {
    const image = element("img", "file-picker-thumb");
    image.loading = "lazy";
    image.alt = "";
    image.src = model.toUrl(path);
    return image;
  }
  const icon = VIDEO_PATTERN.test(path)
    ? "fa-solid fa-film"
    : AUDIO_PATTERN.test(path)
      ? "fa-solid fa-music"
      : PDF_PATTERN.test(path)
        ? "fa-solid fa-file-pdf"
        : NOTE_PATTERN.test(path)
          ? "fa-solid fa-file-lines"
          : "fa-solid fa-file";
  return element("i", `${icon} file-picker-thumb-icon`);
}

function buildFileEntry(path: string, model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const entry = element("li", "file-picker-entry file");
  entry.dataset.filePath = path;
  entry.title = path;
  entry.classList.toggle("selected", path === model.selectedPath);
  entry.append(buildFilePreview(path, model), element("span", "file-picker-name", baseName(path)));
  if (model.canUpload) entry.append(deleteEntryButton(path, handlers));
  entry.addEventListener("click", () => handlers.select(path));
  entry.addEventListener("dblclick", () => handlers.confirm(path));
  if (IMAGE_PATTERN.test(path) || VIDEO_PATTERN.test(path)) {
    entry.draggable = true;
    entry.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", JSON.stringify(imageTileDragData(path)));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    });
  }
  if (model.browseOnly) {
    entry.tabIndex = 0;
    entry.setAttribute("aria-label", `Abrir ${baseName(path)}`);
    entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handlers.confirm(path);
    });
  }
  return entry;
}

function buildListing(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const list = element("ul", "file-picker-listing");
  for (const directory of model.result.dirs) list.append(buildDirectoryEntry(directory, model, handlers));
  if (model.type !== "folder") for (const file of model.result.files) list.append(buildFileEntry(file, model, handlers));
  if (list.childElementCount === 0) list.append(element("li", "file-picker-empty", "Pasta vazia. Arraste arquivos ou pastas do Windows para cá."));
  return list;
}

function buildUploadControls(handlers: FilePickerViewHandlers): HTMLElement {
  const controls = element("div", "file-picker-upload");
  const fileInput = element("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) handlers.upload(Array.from(fileInput.files));
    fileInput.value = "";
  });
  const folderPicker = element("input");
  folderPicker.type = "file";
  folderPicker.multiple = true;
  folderPicker.hidden = true;
  folderPicker.setAttribute("webkitdirectory", "");
  folderPicker.setAttribute("directory", "");
  folderPicker.addEventListener("change", () => {
    if (folderPicker.files?.length) handlers.uploadRelative(folderPicker.files, true);
    folderPicker.value = "";
  });
  const folderInput = element("input", "file-picker-folder-name");
  folderInput.type = "text";
  folderInput.maxLength = 60;
  folderInput.placeholder = "Nova pasta";
  controls.append(
    fileInput,
    folderPicker,
    iconButton("fa-solid fa-upload", "Enviar arquivo", () => fileInput.click()),
    iconButton("fa-solid fa-folder-open", "Enviar pasta", () => folderPicker.click()),
    iconButton("fa-solid fa-file-pen", "Nova nota", () => handlers.createNote()),
    folderInput,
    iconButton("fa-solid fa-folder-plus", "Criar", () => handlers.createFolder(folderInput.value)),
    iconButton("fa-solid fa-trash", "Apagar", () => handlers.deletePaths([]), "file-picker-button danger"),
  );
  return controls;
}

function buildFooter(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const footer = element("footer", "file-picker-footer");
  const selection = element("input");
  selection.type = "text";
  selection.name = "file-picker-selection";
  selection.value = model.selectedPath;
  selection.placeholder = "Caminho do arquivo";
  selection.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handlers.confirm(selection.value);
  });
  const confirmButton = iconButton("fa-solid fa-check", "Selecionar", () => handlers.confirm(selection.value));
  confirmButton.classList.add("primary");
  footer.append(selection, confirmButton);
  return footer;
}

function enableDropUpload(root: HTMLElement, handlers: FilePickerViewHandlers): void {
  root.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    root.classList.add("drop-target");
  });
  root.addEventListener("dragleave", () => root.classList.remove("drop-target"));
  root.addEventListener("drop", (event) => {
    root.classList.remove("drop-target");
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    handlers.uploadDataTransfer(event.dataTransfer);
  });
}

export function createFilePickerView(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const root = element("div", "file-picker-body");
  root.append(buildToolbar(model, handlers), buildListing(model, handlers));
  if (model.canUpload) {
    root.append(buildUploadControls(handlers));
    enableDropUpload(root, handlers);
    const hint = element("p", "file-picker-hint hint", "Arraste arquivos ou pastas do Windows para cá. Subpastas são recriadas. Delete apaga o item selecionado.");
    root.append(hint);
  }
  if (model.browseOnly) root.append(element("p", "file-picker-hint hint", "Clique duas vezes num arquivo para abrir: notas abrem para editar, PDFs e imagens em outra janela."));
  else root.append(buildFooter(model, handlers));
  return root;
}
