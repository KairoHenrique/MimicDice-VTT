import type { FilePickerBrowseResult, FilePickerType } from "./FilePicker";

export interface FilePickerViewModel {
  result: FilePickerBrowseResult;
  selectedPath: string;
  type: FilePickerType;
  canUpload: boolean;
  toUrl: (path: string) => string;
}

export interface FilePickerViewHandlers {
  navigate(path: string): void;
  select(path: string): void;
  confirm(path: string): void;
  upload(files: readonly File[]): void;
  createFolder(name: string): void;
}

const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const VIDEO_PATTERN = /\.(webm|mp4|m4v)$/i;
const AUDIO_PATTERN = /\.(mp3|ogg|oga|wav|flac|m4a)$/i;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

function iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = element("button", "file-picker-button");
  button.type = "button";
  button.append(element("i", icon), document.createTextNode(` ${label}`));
  button.addEventListener("click", onClick);
  return button;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function buildToolbar(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const toolbar = element("div", "file-picker-toolbar");
  const target = model.result.target;
  const parent = target.split("/").slice(0, -1).join("/");
  const upButton = iconButton("fa-solid fa-arrow-up", "Voltar", () => handlers.navigate(parent));
  upButton.disabled = target === "";
  const breadcrumb = element("span", "file-picker-path", `/${target}`);
  toolbar.append(upButton, breadcrumb);
  return toolbar;
}

function buildDirectoryEntry(path: string, handlers: FilePickerViewHandlers): HTMLElement {
  const entry = element("li", "file-picker-entry directory");
  entry.title = path;
  entry.append(element("i", "fa-solid fa-folder"), element("span", "file-picker-name", baseName(path)));
  entry.addEventListener("click", () => handlers.navigate(path));
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
  const icon = VIDEO_PATTERN.test(path) ? "fa-solid fa-film" : AUDIO_PATTERN.test(path) ? "fa-solid fa-music" : "fa-solid fa-file";
  return element("i", `${icon} file-picker-thumb-icon`);
}

function buildFileEntry(path: string, model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const entry = element("li", "file-picker-entry file");
  entry.dataset.filePath = path;
  entry.title = path;
  entry.classList.toggle("selected", path === model.selectedPath);
  entry.append(buildFilePreview(path, model), element("span", "file-picker-name", baseName(path)));
  entry.addEventListener("click", () => handlers.select(path));
  entry.addEventListener("dblclick", () => handlers.confirm(path));
  return entry;
}

function buildListing(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const list = element("ul", "file-picker-listing");
  for (const directory of model.result.dirs) list.append(buildDirectoryEntry(directory, handlers));
  if (model.type !== "folder") for (const file of model.result.files) list.append(buildFileEntry(file, model, handlers));
  if (list.childElementCount === 0) list.append(element("li", "file-picker-empty", "Pasta vazia."));
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
  });
  const folderInput = element("input", "file-picker-folder-name");
  folderInput.type = "text";
  folderInput.maxLength = 60;
  folderInput.placeholder = "Nova pasta";
  controls.append(
    fileInput,
    iconButton("fa-solid fa-upload", "Enviar arquivo", () => fileInput.click()),
    folderInput,
    iconButton("fa-solid fa-folder-plus", "Criar", () => handlers.createFolder(folderInput.value)),
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
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    event.preventDefault();
    handlers.upload(Array.from(files));
  });
}

export function createFilePickerView(model: FilePickerViewModel, handlers: FilePickerViewHandlers): HTMLElement {
  const root = element("div", "file-picker-body");
  root.append(buildToolbar(model, handlers), buildListing(model, handlers));
  if (model.canUpload) {
    root.append(buildUploadControls(handlers));
    enableDropUpload(root, handlers);
  }
  root.append(buildFooter(model, handlers));
  return root;
}
