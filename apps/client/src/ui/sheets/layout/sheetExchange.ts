import { DialogV2 } from "@tabbletop/api";
import {
  MAX_SHEET_EXCHANGE_FILE_BYTES,
  SHEET_EXCHANGE_FORMAT,
  sheetExchangeFileSchema,
  type ActorRole,
  type SheetExchangeFile,
  type SheetLayout,
  type SheetTemplate,
} from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import { ROLE_PRESENTATION } from "../../actors/actorRoles";
import { EMPTY_LAYOUT, readLayout } from "./sheetLayoutRules";
import { listSheetTemplates, saveSheetTemplate, setDefaultTemplate } from "./sheetTemplateStore";

function fileNameFor(title: string): string {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "fichas"}.mimicdice.json`;
}

function downloadExchangeFile(file: SheetExchangeFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: fileNameFor(file.title) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function exchangeEntry(template: Pick<SheetTemplate, "name" | "description" | "role" | "layout">): SheetExchangeFile["templates"][number] {
  return { name: template.name.slice(0, 60), description: template.description, role: template.role, layout: template.layout };
}

/** Saves the sheet a player or GM built on an actor, so it can be sent to another table. */
export function exportActorSheet(actorName: string, role: ActorRole, layout: SheetLayout): void {
  const title = (actorName.trim() || "Ficha").slice(0, 60);
  downloadExchangeFile({ format: SHEET_EXCHANGE_FORMAT, version: 1, title, templates: [exchangeEntry({ name: title, role, layout })] });
  ui.notifications.info("Ficha exportada. Envie o arquivo .mimicdice.json para quem quiser usar.");
}

/** Lets the GM pick which models form the "system" to share. */
export async function exportSystemDialog(): Promise<void> {
  const templates = listSheetTemplates();
  const titleInput = h("input", { type: "text", name: "title", value: game.world.title, maxlength: 60, required: true });
  const list = h("div", { class: "md-template-list" });
  for (const template of templates) {
    list.append(
      h(
        "label",
        { class: "md-template-option" },
        h("input", { type: "checkbox", name: "include", value: template.id, checked: !template.id.startsWith("preset-") }),
        h("span", { class: "md-template-text" }, h("strong", {}, template.name), h("span", { class: "hint" }, ROLE_PRESENTATION[template.role].label)),
      ),
    );
  }
  const content = h("div", {}, h("label", { class: "form-group md-dialog-group" }, h("span", {}, "Nome do sistema"), titleInput), h("p", { class: "hint" }, "Marque os modelos que vão no arquivo:"), list);
  const confirmed = await DialogV2.prompt({ window: { title: "Exportar sistema de fichas" }, position: { width: 480 } as any, content, ok: { label: "Exportar", icon: "fa-solid fa-file-export", callback: () => true } });
  if (confirmed !== true) return;
  const chosenIds = new Set(Array.from(list.querySelectorAll<HTMLInputElement>("input[name=include]:checked"), (input) => input.value));
  const chosen = templates.filter((template) => chosenIds.has(template.id));
  if (chosen.length === 0) {
    ui.notifications.warn("Marque pelo menos um modelo.");
    return;
  }
  downloadExchangeFile({ format: SHEET_EXCHANGE_FORMAT, version: 1, title: titleInput.value.trim().slice(0, 60) || "Sistema", templates: chosen.map(exchangeEntry) });
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept: ".json,application/json" });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

async function readExchangeFile(file: File): Promise<SheetExchangeFile> {
  if (file.size > MAX_SHEET_EXCHANGE_FILE_BYTES) throw new Error("Arquivo grande demais (máx. 2 MB).");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await file.text());
  } catch {
    throw new Error("Esse arquivo não é um JSON válido.");
  }
  const parsed = sheetExchangeFileSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error("Esse arquivo não é uma ficha do MimicDice ou está corrompido.");
  return parsed.data;
}

async function confirmImport(file: SheetExchangeFile): Promise<{ makeDefault: boolean } | null> {
  const items = file.templates.map((template) => h("li", {}, h("strong", {}, template.name), ` (${ROLE_PRESENTATION[template.role].label})`));
  const makeDefault = h("input", { type: "checkbox", name: "makeDefault", checked: true });
  const content = h(
    "div",
    {},
    h("p", {}, `Importar "${file.title}" com ${file.templates.length} modelo(s):`),
    h("ul", {}, ...items),
    h("label", { class: "md-check-row" }, makeDefault, h("span", {}, "Usar como ficha padrão (o primeiro modelo de cada tipo)")),
    h("p", { class: "hint" }, "Modelos com o mesmo nome de um que você já tem são substituídos."),
  );
  const confirmed = await DialogV2.prompt({ window: { title: "Importar fichas" }, content, ok: { label: "Importar", icon: "fa-solid fa-file-import", callback: () => true } });
  return confirmed === true ? { makeDefault: makeDefault.checked } : null;
}

/** GM-only: world settings hold the models, so only the GM can store imported ones. */
export async function importSheetsDialog(): Promise<void> {
  const file = await pickFile();
  if (!file) return;
  try {
    const exchange = await readExchangeFile(file);
    const choice = await confirmImport(exchange);
    if (!choice) return;
    const defaultedRoles = new Set<ActorRole>();
    for (const entry of exchange.templates) {
      const saved = await saveSheetTemplate(entry.name, entry.role, readLayout(entry.layout) ?? EMPTY_LAYOUT, entry.description);
      if (choice.makeDefault && !defaultedRoles.has(entry.role)) {
        defaultedRoles.add(entry.role);
        await setDefaultTemplate(entry.role, saved.id);
      }
    }
    ui.notifications.info(`${exchange.templates.length} modelo(s) importado(s). Use em "Modelos" na ficha ou ao criar um personagem.`);
  } catch (error) {
    ui.notifications.error(error instanceof Error ? error.message : "Não foi possível importar.");
  }
}
