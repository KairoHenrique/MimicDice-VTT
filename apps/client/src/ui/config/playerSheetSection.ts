import { DialogV2 } from "@tabbletop/api";
import { playersEditSheets, setPlayersEditSheets } from "../../game/tableRules";
import { h } from "../../views/dom";
import { applyTemplateToActor } from "../actors/actorAssignment";
import { isPlayerCharacter } from "../actors/actorRoles";
import { defaultTemplateFor, findSheetTemplate, setDefaultTemplate } from "../sheets/layout/sheetTemplateStore";
import { SheetTemplateEditor } from "../sheets/layout/editor/SheetTemplateEditor";
import { templatesForRole } from "../sheets/layout/templateDialogs";

async function applyDefaultToEveryPlayer(): Promise<void> {
  const template = defaultTemplateFor("player");
  const actors: any[] = (game.actors?.contents ?? []).filter((actor: any) => isPlayerCharacter(actor));
  if (!template || actors.length === 0) {
    ui.notifications.info("Não há personagens de jogadores para atualizar.");
    return;
  }
  const confirmed = await DialogV2.confirm({
    window: { title: "Aplicar a ficha padrão" },
    content: h("p", {}, `Trocar a ficha de ${actors.length} personagem(ns) de jogadores pelo modelo "${template.name}"? Valores com o mesmo nome continuam preenchidos.`),
    yes: { label: "Aplicar em todos" },
    no: { label: "Cancelar" },
  });
  if (confirmed !== true) return;
  const results = await Promise.allSettled(actors.map((actor) => applyTemplateToActor(actor, template)));
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed > 0) ui.notifications.warn(`${failed} ficha(s) não puderam ser trocadas.`);
  else ui.notifications.info(`Ficha "${template.name}" aplicada em ${actors.length} personagem(ns).`);
}

function defaultTemplateSelect(rerender: () => void): HTMLElement {
  const currentId = defaultTemplateFor("player")?.id;
  const select = h("select", { "aria-label": "Ficha padrão dos jogadores" }, ...templatesForRole("player").map((template) => h("option", { value: template.id, selected: template.id === currentId }, template.name)));
  select.addEventListener("change", () => {
    if (!findSheetTemplate(select.value)) return;
    void setDefaultTemplate("player", select.value)
      .catch(() => ui.notifications.error("Não foi possível salvar essa configuração."))
      .finally(rerender);
  });
  return h("label", { class: "gm-rules-field" }, h("span", {}, "Ficha padrão dos jogadores"), select);
}

/** GM: which sheet players start with, applying it to everyone at once, and whether players may change their own. */
export function buildPlayerSheetSection(rerender: () => void, checkboxRow: (label: string, checked: boolean, onChange: (checked: boolean) => void) => HTMLElement): HTMLElement {
  const applyAll = h("button", { type: "button" }, h("i", { class: "fa-solid fa-users-gear", "aria-hidden": "true" }), " Aplicar agora em todos os jogadores");
  applyAll.addEventListener("click", () => void applyDefaultToEveryPlayer());
  const blankModel = h("button", { type: "button" }, h("i", { class: "fa-solid fa-file-circle-plus", "aria-hidden": "true" }), " Criar modelo de ficha do zero");
  blankModel.addEventListener("click", () => SheetTemplateEditor.open("player"));
  const editing = checkboxRow("Jogadores podem editar a própria ficha e escolher qualquer modelo", playersEditSheets(), (checked) => {
    void setPlayersEditSheets(checked)
      .catch(() => ui.notifications.error("Não foi possível salvar essa configuração."))
      .finally(rerender);
  });
  return h(
    "section",
    { class: "config-group gm-rules-group" },
    h("h3", {}, "Fichas dos jogadores"),
    h("p", { class: "hint" }, "Com a edição desligada, o jogador só preenche a ficha. Para deixar um jogador alternar entre fichas, abra a ficha dele e use \"Modelos do jogador\"."),
    defaultTemplateSelect(rerender),
    h("div", { class: "gm-rules-actions" }, applyAll, blankModel),
    editing,
  );
}
