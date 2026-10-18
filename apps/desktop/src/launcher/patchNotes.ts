import type { DesktopBridge, UpdateStatus } from "../ipcChannels";
import patchNotesRaw from "../../../../PATCHNOTES.md";

export const GITHUB_PATCHNOTES_URL = "https://github.com/KairoHenrique/MimicDice-VTT/blob/main/PATCHNOTES.md";
const SEEN_VERSION_STORAGE_KEY = "mimicdice_seen_patchnotes_version";

export interface VersionBlock {
  version: string;
  markdown: string;
}

export function parsePatchNotes(raw: string): VersionBlock[] {
  const blocks: VersionBlock[] = [];
  const lines = raw.split(/\r?\n/);
  let currentVersion: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const versionMatch = line.match(/^##\s+(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    if (versionMatch) {
      if (currentVersion) {
        blocks.push({ version: currentVersion, markdown: currentLines.join("\n").trim() });
      }
      currentVersion = versionMatch[1];
      currentLines = [];
    } else if (currentVersion) {
      currentLines.push(line);
    }
  }

  if (currentVersion && currentLines.length > 0) {
    blocks.push({ version: currentVersion, markdown: currentLines.join("\n").trim() });
  }

  return blocks;
}

function formatInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdownNotes(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inTopList = false;
  let inSubList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^\s{2,}[-*]\s+/.test(line)) {
      if (!inTopList) {
        htmlParts.push('<ul class="patchnotes-list">');
        inTopList = true;
      }
      if (!inSubList) {
        htmlParts.push('<ul class="patchnotes-sublist">');
        inSubList = true;
      }
      const content = line.replace(/^\s{2,}[-*]\s+/, "");
      htmlParts.push(`<li>${formatInline(content)}</li>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (inSubList) {
        htmlParts.push("</ul>");
        inSubList = false;
      }
      if (!inTopList) {
        htmlParts.push('<ul class="patchnotes-list">');
        inTopList = true;
      }
      const content = line.replace(/^[-*]\s+/, "");
      htmlParts.push(`<li>${formatInline(content)}</li>`);
    } else {
      if (inSubList) {
        htmlParts.push("</ul>");
        inSubList = false;
      }
      if (inTopList) {
        htmlParts.push("</ul>");
        inTopList = false;
      }
      htmlParts.push(`<p class="patchnotes-paragraph">${formatInline(trimmed)}</p>`);
    }
  }

  if (inSubList) htmlParts.push("</ul>");
  if (inTopList) htmlParts.push("</ul>");

  return htmlParts.join("");
}

export class PatchNotesManager {
  readonly #bridge: DesktopBridge;
  readonly #blocks: VersionBlock[];
  readonly #dialog: HTMLDialogElement;
  readonly #content: HTMLElement;
  readonly #select: HTMLSelectElement;
  #currentAppVersion: string = "";
  #updateStatus: UpdateStatus | null = null;

  constructor(bridge: DesktopBridge) {
    this.#bridge = bridge;
    this.#blocks = parsePatchNotes(patchNotesRaw);
    this.#dialog = document.getElementById("patchnotes-dialog") as HTMLDialogElement;
    this.#content = document.getElementById("patchnotes-content") as HTMLElement;
    this.#select = document.getElementById("patchnotes-version-select") as HTMLSelectElement;
    this.#bindEvents();
  }

  setUpdateStatus(status: UpdateStatus): void {
    this.#updateStatus = status;
  }

  setAppVersion(version: string): void {
    const wasEmpty = !this.#currentAppVersion;
    this.#currentAppVersion = version;
    if (wasEmpty && version) {
      this.#checkAutoShow(version);
    }
  }

  #populateSelect(selectedVersion: string): void {
    this.#select.innerHTML = "";
    for (const block of this.#blocks) {
      const option = document.createElement("option");
      option.value = block.version;
      const isCurrent = block.version === this.#currentAppVersion;
      const isLatest = block === this.#blocks[0];
      const suffix = isLatest ? " (Mais recente)" : isCurrent ? " (Atual)" : "";
      option.textContent = `v${block.version}${suffix}`;
      if (block.version === selectedVersion) {
        option.selected = true;
      }
      this.#select.appendChild(option);
    }
  }

  renderVersionNotes(targetVersion: string, releaseNotes?: string): void {
    this.#populateSelect(targetVersion);

    const matchingBlock = this.#blocks.find((block) => block.version === targetVersion);
    const mainHtml = matchingBlock
      ? renderMarkdownNotes(matchingBlock.markdown)
      : releaseNotes
        ? renderMarkdownNotes(releaseNotes)
        : this.#blocks[0]
          ? renderMarkdownNotes(this.#blocks[0].markdown)
          : "<p>Nenhuma nota encontrada para esta versão.</p>";

    const olderBlocks = this.#blocks.filter((b) => b.version !== targetVersion);
    let olderHtml = "";
    if (olderBlocks.length > 0) {
      const olderItems = olderBlocks
        .map(
          (b) => `
        <details class="patchnotes-older-item">
          <summary class="patchnotes-older-summary">
            <span class="patchnotes-older-version">v${b.version}</span>
            <span class="patchnotes-older-arrow" aria-hidden="true">▾</span>
          </summary>
          <div class="patchnotes-older-body">
            ${renderMarkdownNotes(b.markdown)}
          </div>
        </details>`
        )
        .join("");

      olderHtml = `
        <div class="patchnotes-older-section">
          <h3 class="patchnotes-older-title">Outras versões anteriores</h3>
          ${olderItems}
        </div>`;
    }

    this.#content.innerHTML = `
      <div class="patchnotes-main-section">
        ${mainHtml}
      </div>
      ${olderHtml}
    `;
    this.#content.scrollTop = 0;
  }

  open(options?: { version?: string; releaseNotes?: string }): void {
    const targetVersion = options?.version || this.#currentAppVersion || this.#blocks[0]?.version || "1.7.5";
    this.renderVersionNotes(targetVersion, options?.releaseNotes);

    if (!this.#dialog.open) {
      this.#dialog.showModal();
    }
  }

  close(): void {
    if (this.#dialog.open) {
      this.#dialog.close();
    }
  }

  #checkAutoShow(version: string): void {
    try {
      const lastSeen = localStorage.getItem(SEEN_VERSION_STORAGE_KEY);
      if (lastSeen !== version) {
        localStorage.setItem(SEEN_VERSION_STORAGE_KEY, version);
        // Only auto-show if there was already a previously recorded version (i.e. user upgraded)
        if (lastSeen) {
          this.open({ version });
        }
      }
    } catch {
      // localStorage may fail in restricted sandboxes
    }
  }

  #bindEvents(): void {
    document.getElementById("patchnotes-close-icon")?.addEventListener("click", () => this.close());
    document.getElementById("patchnotes-dialog-close")?.addEventListener("click", () => this.close());

    this.#dialog.addEventListener("click", (event) => {
      if (event.target === this.#dialog) {
        this.close();
      }
    });

    this.#select.addEventListener("change", () => {
      this.renderVersionNotes(this.#select.value);
    });

    document.getElementById("patchnotes-github-btn")?.addEventListener("click", () => {
      void this.#bridge.openExternal(GITHUB_PATCHNOTES_URL);
    });

    document.getElementById("update-patchnotes")?.addEventListener("click", () => {
      this.open({ version: this.#updateStatus?.version, releaseNotes: this.#updateStatus?.releaseNotes });
    });

    document.getElementById("footer-patchnotes")?.addEventListener("click", () => {
      this.open();
    });

    document.getElementById("version")?.addEventListener("click", () => {
      this.open();
    });
  }
}
