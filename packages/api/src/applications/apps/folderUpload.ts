export interface RelativeUpload {
  file: File;
  /** Path relative to the destination folder, using `/` (empty when the file sits at the root). */
  relativeDir: string;
}

const MAX_FOLDER_UPLOAD_FILES = 200;

function splitRelativePath(relativePath: string): { relativeDir: string; name: string } {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  const name = parts.pop() ?? "";
  return { relativeDir: parts.join("/"), name };
}

/** Files chosen with a folder picker (`webkitdirectory`): keep the folder tree like Windows Explorer. */
export function relativeUploadsFromFileList(files: Iterable<File>): RelativeUpload[] {
  const uploads: RelativeUpload[] = [];
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const { relativeDir } = splitRelativePath(relative);
    uploads.push({ file, relativeDir });
  }
  return uploads;
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => { readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void };
}

function readAllEntries(reader: { readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void }): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const collected: FileSystemEntryLike[] = [];
    const next = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) resolve(collected);
          else {
            collected.push(...entries);
            next();
          }
        },
        (error) => reject(error),
      );
    };
    next();
  });
}

async function walkEntry(entry: FileSystemEntryLike, relativeDir: string, into: RelativeUpload[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    into.push({ file, relativeDir });
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const nextDir = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
  for (const child of await readAllEntries(entry.createReader())) await walkEntry(child, nextDir, into);
}

/**
 * Files and folders dropped from the computer. Dropped folders keep their name and internal tree (Windows Explorer
 * behaviour). Loose files land in the current folder. When the browser does not expose entries, falls back to a flat list.
 */
export async function relativeUploadsFromDataTransfer(dataTransfer: DataTransfer): Promise<RelativeUpload[]> {
  const items = [...(dataTransfer.items ?? [])];
  const asEntry = (item: DataTransferItem): FileSystemEntryLike | null =>
    ((item as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.() as FileSystemEntryLike | null | undefined) ?? null;
  if (items.some((item) => typeof (item as DataTransferItem & { webkitGetAsEntry?: unknown }).webkitGetAsEntry === "function")) {
    const uploads: RelativeUpload[] = [];
    for (const item of items) {
      const entry = asEntry(item);
      if (!entry) continue;
      if (entry.isFile) await walkEntry(entry, "", uploads);
      else if (entry.isDirectory && entry.createReader) {
        for (const child of await readAllEntries(entry.createReader())) await walkEntry(child, entry.name, uploads);
      }
    }
    if (uploads.length) return uploads;
  }
  return [...dataTransfer.files].map((file) => ({ file, relativeDir: "" }));
}

export function trimFolderUpload(uploads: RelativeUpload[]): { uploads: RelativeUpload[]; truncated: boolean } {
  if (uploads.length <= MAX_FOLDER_UPLOAD_FILES) return { uploads, truncated: false };
  return { uploads: uploads.slice(0, MAX_FOLDER_UPLOAD_FILES), truncated: true };
}

export function joinUploadFolder(root: string, relativeDir: string): string {
  const base = root.replace(/\/+$/, "");
  const relative = relativeDir.replace(/^\/+|\/+$/g, "");
  return relative ? `${base}/${relative}` : base;
}

export { MAX_FOLDER_UPLOAD_FILES };
