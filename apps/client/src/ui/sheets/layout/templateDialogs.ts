import { DialogV2 } from "@tabbletop/api";
import { ACTOR_ROLES, type ActorRole, type SheetLayout, type SheetTemplate } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import { ROLE_PRESENTATION } from "../../actors/actorRoles";
import { isPresetId } from "./sheetPresets";
import { defaultTemplateFor, deleteSheetTemplate, listSheetTemplates, saveSheetTemplate, setDefaultTemplate } from "./sheetTemplateStore";

function componentCount(template: SheetTemplate): number {
  return template.layout.pages.reduce((total, page) => total + page.components.length, 0);
}

/** The role's default model first, then the role's other models, then the rest, each group in its original order. */
export function templatesForRole(role: ActorRole): SheetTemplate[] {
  const templates = listSheetTemplates();
  const defaultId = defaultTemplateFor(role)?.id;
  const rank = (template: SheetTemplate) => (template.id === defaultId ? 0 : template.role === role ? 1 : 2);
  return templates.map((template, index) => ({ template, index })).sort((left, right) => rank(left.template) - rank(right.template) || left.index - right.index).map(({ template }) => template);
}

function defaultToggle(role: ActorRole, checked: boolean): HTMLElement {
  return h("label", { class: "md-check-row" }, h("input", { type: "checkbox", name: "makeDefault", checked }), h("span", {}, `Usar como ficha padrão de ${ROLE_PRESENTATION[role].label.toLowerCase()} (todo novo ${ROLE_PRESENTATION[role].label.toLowerCase()} já nasce com ela)`));
}

export function roleSelect(name: string, selected: ActorRole): HTMLSelectElement {
  const select = h("select", { name });
  for (const role of ACTOR_ROLES) select.append(h("option", { value: role, selected: role === selected }, ROLE_PRESENTATION[role].label));
  return select;
}

function isDefaultFor(template: SheetTemplate): boolean {
  return defaultTemplateFor(template.role)?.id === template.id;
}

function templateOption(template: SheetTemplate, checked: boolean, onDelete: (() => void) | null): HTMLElement {
  const role = ROLE_PRESENTATION[template.role];
  const option = h(
    "label",
    { class: "md-template-option" },
    h("input", { type: "radio", name: "template", value: template.id, checked }),
    h(
      "span",
      { class: "md-template-text" },
      h("strong", {}, template.name, isDefaultFor(template) ? h("span", { class: "md-default-badge" }, "padrão") : null),
      h("span", { class: "hint" }, `${role.label} · ${template.layout.pages.length} página(s) · ${componentCount(template)} componentes${isPresetId(template.id) ? "" : " · salvo pelo mestre"}`),
      template.description ? h("span", { class: "hint" }, template.description) : null,
    ),
  );
  if (onDelete) {
    const remove = h("button", { type: "button", class: "icon md-icon-button danger", title: "Apagar modelo" }, h("i", { class: "fa-solid fa-trash" }));
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      onDelete();
      option.remove();
    });
    option.append(remove);
  }
  return option;
}

/** Lists presets and saved models; the GM can also delete saved ones from here. */
export async function chooseTemplateDialog(role: ActorRole): Promise<SheetTemplate | null> {
  const templates = templatesForRole(role);
  const list = h("div", { class: "md-template-list" });
  templates.forEach((template, index) => {
    const canDelete = game.user.isGM && !isPresetId(template.id);
    list.append(templateOption(template, index === 0, canDelete ? () => void deleteSheetTemplate(template.id) : null));
  });
  const toggle = game.user.isGM ? defaultToggle(role, false) : null;
  const content = h("div", {}, h("p", { class: "hint" }, "A ficha atual é trocada pelo modelo. Valores já preenchidos com o mesmo atalho são mantidos."), list, toggle);
  const chosenId = await DialogV2.prompt({
    window: { title: "Aplicar modelo de ficha" },
    position: { width: 480 } as any,
    content,
    ok: { label: "Aplicar", icon: "fa-solid fa-wand-magic-sparkles", callback: () => list.querySelector<HTMLInputElement>("input[name=template]:checked")?.value ?? null },
  });
  const chosen = templates.find((template) => template.id === chosenId) ?? null;
  if (chosen && toggle?.querySelector<HTMLInputElement>("input")?.checked) await setDefaultTemplate(role, chosen.id);
  return chosen;
}

export async function saveTemplateDialog(layout: SheetLayout, role: ActorRole, suggestedName: string): Promise<void> {
  const nameInput = h("input", { type: "text", name: "name", value: suggestedName, maxlength: 60, required: true });
  const descriptionInput = h("input", { type: "text", name: "description", maxlength: 200, placeholder: "Opcional" });
  const roleInput = roleSelect("role", role);
  const content = h(
    "div",
    { class: "md-field-dialog" },
    h("label", { class: "form-group md-dialog-group" }, h("span", {}, "Nome do modelo"), nameInput),
    h("label", { class: "form-group md-dialog-group" }, h("span", {}, "Para"), roleInput),
    h("label", { class: "form-group md-dialog-group" }, h("span", {}, "Descrição"), descriptionInput),
    h("p", { class: "hint" }, "Salvar com um nome que já existe atualiza aquele modelo."),
    h("label", { class: "md-check-row" }, h("input", { type: "checkbox", name: "makeDefault", checked: true }), h("span", {}, "Usar como ficha padrão desse tipo (jogadores e NPCs novos já nascem com ela)")),
  );
  const confirmed = await DialogV2.prompt({ window: { title: "Salvar como modelo" }, content, ok: { label: "Salvar modelo", icon: "fa-solid fa-floppy-disk", callback: () => true } });
  const name = nameInput.value.trim();
  if (confirmed !== true || !name) return;
  try {
    const savedRole = roleInput.value as ActorRole;
    const saved = await saveSheetTemplate(name.slice(0, 60), savedRole, layout, descriptionInput.value.trim() || undefined);
    if (content.querySelector<HTMLInputElement>("input[name=makeDefault]")?.checked) await setDefaultTemplate(savedRole, saved.id);
    ui.notifications.info(`Modelo "${name}" salvo.`);
  } catch (error) {
    ui.notifications.warn(error instanceof Error ? error.message : "Não foi possível salvar o modelo.");
  }
}
