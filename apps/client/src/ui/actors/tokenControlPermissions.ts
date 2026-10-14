import { CONST } from "@tabbletop/api";
import { h } from "../../views/dom";

const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;

interface ControlCheckbox {
  key: string;
  input: HTMLInputElement;
  wasOwner: boolean;
}

function controlCheckbox(key: string, label: string, wasOwner: boolean, hint?: string): { row: HTMLElement; checkbox: ControlCheckbox } {
  const input = h("input", { type: "checkbox", name: key, checked: wasOwner });
  const row = h("label", { class: "control-permission-row" }, input, h("span", {}, label), hint ? h("small", { class: "hint" }, hint) : null);
  return { row, checkbox: { key, input, wasOwner } };
}

/**
 * Only the "owner" level is touched: checking grants it, unchecking takes it away (a player falls back to the
 * default; the default falls back to hidden). Other levels the GM set by hand stay as they are.
 */
function ownershipChanges(checkboxes: readonly ControlCheckbox[]): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const { key, input, wasOwner } of checkboxes) {
    if (input.checked === wasOwner) continue;
    if (input.checked) changes[`ownership.${key}`] = LEVELS.OWNER;
    else if (key === "default") changes["ownership.default"] = LEVELS.NONE;
    else changes[`ownership.-=${key}`] = null;
  }
  return changes;
}

/** GM-only: picks which players may move this character's tokens and use its sheet, or opens it to everyone. */
export async function configureTokenControl(actor: any): Promise<void> {
  if (!game.user.isGM || !actor) return;
  const ownership: Record<string, number> = actor._source?.ownership ?? {};
  const everyone = controlCheckbox("default", "Todos os jogadores (controle geral)", (ownership.default ?? LEVELS.NONE) >= LEVELS.OWNER, "Bom para NPCs que o grupo inteiro pode mover.");
  const players = game.users.players.map((player: any) => controlCheckbox(player.id, player.name, (ownership[player.id] ?? LEVELS.INHERIT) >= LEVELS.OWNER));
  const content = h(
    "div",
    { class: "control-permission-form" },
    h("p", { class: "hint" }, "Quem estiver marcado pode mover o boneco, abrir a ficha e rolar com ele."),
    everyone.row,
    ...players.map((player: { row: HTMLElement }) => player.row),
    players.length === 0 ? h("p", { class: "hint" }, "Nenhum jogador cadastrado ainda.") : null,
  );
  const checkboxes = [everyone.checkbox, ...players.map((player: { checkbox: ControlCheckbox }) => player.checkbox)];
  const confirmed = await foundry.applications.api.DialogV2.wait({
    window: { title: `Quem controla ${actor.name}` },
    content,
    buttons: [
      { action: "save", label: "Salvar", icon: "fa-solid fa-check", default: true, callback: () => true },
      { action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark", callback: () => false },
    ],
  });
  if (confirmed !== true) return;
  const changes = ownershipChanges(checkboxes);
  if (Object.keys(changes).length === 0) return;
  await actor.update(changes);
  ui.notifications.info(`Controle de ${actor.name} atualizado.`);
}
