const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

/** `foundry.utils.readTextFromFile`: reads a user-selected file as text. */
export function readTextFromFile(file: Blob): Promise<string> {
  if (file.size > MAX_TEXT_FILE_BYTES) return Promise.reject(new Error("Arquivo grande demais"));
  return file.text();
}

/** `foundry.utils.saveDataToFile`: offers data to the user as a download. */
export function saveDataToFile(data: BlobPart, type: string, filename: string): void {
  const blob = new Blob([data], { type: typeof type === "string" ? type : "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = String(filename ?? "download").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
