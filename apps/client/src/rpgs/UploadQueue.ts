import { h } from "../views/dom";
import { formatBytes } from "./fileKinds";
import { rpgsApi } from "./rpgsApi";

const MAX_PARALLEL_UPLOADS = 3;
const FINISHED_ROW_LINGER_MS = 4000;

interface QueuedUpload {
  file: File;
  folderPath: string;
  row: HTMLLIElement;
  bar: HTMLProgressElement;
  status: HTMLSpanElement;
}

/** Uploads files a few at a time and shows a progress list in the corner. */
export class UploadQueue {
  readonly element = h("section", { class: "upload-queue", "aria-live": "polite", hidden: true });
  readonly #list = h("ul", {});
  readonly #pending: QueuedUpload[] = [];
  #active = 0;

  constructor(private readonly onBatchFinished: (failures: string[]) => void) {
    this.element.append(h("h3", {}, h("i", { class: "fa-solid fa-cloud-arrow-up" }), " Enviando arquivos"), this.#list);
  }

  enqueue(files: Iterable<File>, folderPath: string): void {
    for (const file of files) {
      const bar = h("progress", { max: 1, value: 0 });
      const status = h("span", { class: "upload-status" }, "Na fila");
      const row = h("li", {}, h("span", { class: "upload-name", title: file.name }, file.name), h("span", { class: "upload-size" }, formatBytes(file.size)), bar, status);
      this.#list.append(row);
      this.#pending.push({ file, folderPath, row, bar, status });
    }
    this.element.hidden = this.#list.childElementCount === 0;
    this.#pump([]);
  }

  #pump(failures: string[]): void {
    while (this.#active < MAX_PARALLEL_UPLOADS && this.#pending.length > 0) {
      const upload = this.#pending.shift()!;
      this.#active += 1;
      void this.#run(upload, failures).finally(() => {
        this.#active -= 1;
        if (this.#active === 0 && this.#pending.length === 0) this.onBatchFinished(failures);
        else this.#pump(failures);
      });
    }
  }

  async #run(upload: QueuedUpload, failures: string[]): Promise<void> {
    upload.status.textContent = "Enviando";
    try {
      await rpgsApi.uploadFile(upload.folderPath, upload.file, (fraction) => (upload.bar.value = fraction));
      upload.bar.value = 1;
      upload.status.textContent = "Pronto";
      upload.row.classList.add("done");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no envio";
      upload.status.textContent = message;
      upload.row.classList.add("failed");
      failures.push(`${upload.file.name}: ${message}`);
    }
    setTimeout(() => {
      upload.row.remove();
      this.element.hidden = this.#list.childElementCount === 0;
    }, FINISHED_ROW_LINGER_MS);
  }
}
