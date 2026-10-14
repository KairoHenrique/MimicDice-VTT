import { DEFAULT_STATUS_RESOURCES, MAX_STATUS_RESOURCE_COUNT, type StatusResource, type TokenMoveRule } from "@tabbletop/protocol";
import {
  playersSeeStatusPanel,
  playersSeeTurnMovement,
  setPlayersSeeStatusPanel,
  setPlayersSeeTurnMovement,
  setStatusResources,
  setTokenMoveRule,
  statusResources,
  tokenMoveRule,
} from "../../game/tableRules";
import { h } from "../../views/dom";
import { LAYOUT_FLAG_KEY, MIMICDICE_FLAG_SCOPE } from "../actors/actorRoles";
import { allComponents, readLayout } from "../sheets/layout/sheetLayoutRules";
import { listSheetTemplates } from "../sheets/layout/sheetTemplateStore";
import { collectSheetFields, normalizeResourceName, parseAliases, type SheetFieldOption } from "../status/statusResourceMatching";
import { buildPlayerSheetSection } from "./playerSheetSection";
import { openEffectLibrary } from "../effects/effectLibraryDialog";
import { effectDefinitions } from "../effects/effectStore";

const MOVE_RULE_OPTIONS: ReadonlyArray<{ rule: TokenMoveRule; label: string; hint: string }> = [
  { rule: "owner", label: "Só quem controla o token", hint: "Cada jogador arrasta apenas os próprios personagens (e os que você liberou)." },
  { rule: "party", label: "Jogadores arrastam os personagens uns dos outros", hint: "Útil para carregar um aliado caído. Inimigos e NPCs continuam só com quem controla." },
];

async function save(task: Promise<unknown>, rerender: () => void): Promise<void> {
  try {
    await task;
  } catch {
    ui.notifications.error("Não foi possível salvar essa configuração.");
  }
  rerender();
}

function section(title: string, hint: string, ...content: Node[]): HTMLElement {
  return h("section", { class: "config-group gm-rules-group" }, h("h3", {}, title), h("p", { class: "hint" }, hint), ...content);
}

function checkboxRow(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "gm-rules-check" }, input, h("span", {}, label));
}

function moveRuleSection(rerender: () => void): HTMLElement {
  const current = tokenMoveRule();
  const options = MOVE_RULE_OPTIONS.map(({ rule, label, hint }) => {
    const radio = h("input", { type: "radio", name: "token-move-rule", value: rule, checked: rule === current });
    radio.addEventListener("change", () => void save(setTokenMoveRule(rule), rerender));
    return h("label", { class: "gm-rules-radio" }, radio, h("span", {}, h("strong", {}, label), h("small", { class: "hint" }, hint)));
  });
  return section(
    "Quem pode arrastar tokens",
    "Para liberar um objeto ou NPC específico (uma carroça, um baú), clique com o botão direito no token e escolha \"Qualquer jogador pode arrastar\".",
    h("div", { role: "radiogroup", "aria-label": "Quem pode arrastar tokens" }, ...options),
  );
}

function visibilitySection(rerender: () => void): HTMLElement {
  return section(
    "O que os jogadores veem",
    "Você sempre vê tudo. Jogadores só veem as barras dos personagens que controlam.",
    checkboxRow("Painel de status com vida, PE e sanidade dos próprios personagens", playersSeeStatusPanel(), (checked) => void save(setPlayersSeeStatusPanel(checked), rerender)),
    checkboxRow("No combate, quanto o personagem da vez já andou", playersSeeTurnMovement(), (checked) => void save(setPlayersSeeTurnMovement(checked), rerender)),
  );
}

function newResourceId(): string {
  return `barra-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

function resourceRow(resource: StatusResource, index: number, resources: StatusResource[], rerender: () => void): HTMLElement {
  const commit = (changes: Partial<StatusResource>) => {
    const next = resources.map((entry, position) => (position === index ? { ...entry, ...changes } : entry));
    void save(setStatusResources(next), rerender);
  };
  const enabled = h("input", { type: "checkbox", checked: resource.enabled, "aria-label": `Mostrar ${resource.label}` });
  enabled.addEventListener("change", () => commit({ enabled: enabled.checked }));
  const playersSee = h("input", { type: "checkbox", checked: resource.playersSee, disabled: !resource.enabled, "aria-label": `Jogadores veem ${resource.label}` });
  playersSee.addEventListener("change", () => commit({ playersSee: playersSee.checked }));
  const label = h("input", { type: "text", value: resource.label, maxlength: 40, "aria-label": "Nome no painel" });
  label.addEventListener("change", () => {
    const text = label.value.trim();
    if (text) commit({ label: text });
    else rerender();
  });
  const color = h("input", { type: "color", value: resource.color, "aria-label": `Cor de ${resource.label}` });
  color.addEventListener("change", () => commit({ color: color.value }));
  const aliases = h("input", { type: "text", value: resource.aliases.join(", "), maxlength: 400, placeholder: "vida, hp, pv", "aria-label": `Nomes do campo na ficha para ${resource.label}` });
  aliases.addEventListener("change", () => commit({ aliases: parseAliases(aliases.value).slice(0, 12) }));
  const remove = h("button", { type: "button", class: "icon", title: `Remover ${resource.label}`, "aria-label": `Remover ${resource.label}` }, h("i", { class: "fa-solid fa-trash", "aria-hidden": "true" }));
  remove.addEventListener("click", () => void save(setStatusResources(resources.filter((_, position) => position !== index)), rerender));
  return h("div", { class: "gm-resource-row" }, enabled, playersSee, label, color, aliases, remove);
}

const FIELD_COLORS = ["#22c55e", "#f59e0b", "#06b6d4", "#ec4899", "#a3a3a3"];

function knownSheetFields(): SheetFieldOption[] {
  const layouts = [...listSheetTemplates().map((template) => template.layout), ...(game.actors?.contents ?? []).map((actor: any) => readLayout(actor.getFlag?.(MIMICDICE_FLAG_SCOPE, LAYOUT_FLAG_KEY)))];
  return collectSheetFields(layouts.filter((layout): layout is NonNullable<typeof layout> => Boolean(layout)).map((layout) => allComponents(layout)));
}

/** Bars and numbers found in the world's sheets that no panel entry reads yet, one click to add. */
function sheetFieldShortcuts(resources: StatusResource[], rerender: () => void): HTMLElement | null {
  const covered = new Set(resources.flatMap((resource) => [resource.label, ...resource.aliases].map(normalizeResourceName)));
  const missing = knownSheetFields().filter((field) => !covered.has(field.key) && !covered.has(normalizeResourceName(field.label)));
  if (missing.length === 0) return null;
  const full = resources.length >= MAX_STATUS_RESOURCE_COUNT;
  const chips = missing.slice(0, 24).map((field, index) => {
    const chip = h("button", { type: "button", class: "gm-field-chip", disabled: full, title: field.kind === "resource" ? "Barra (atual / máximo)" : "Número" }, h("i", { class: field.kind === "resource" ? "fa-solid fa-heart-pulse" : "fa-solid fa-hashtag", "aria-hidden": "true" }), ` ${field.label}`);
    chip.addEventListener("click", () => {
      const entry: StatusResource = { id: newResourceId(), label: field.label.slice(0, 40), aliases: [field.key], color: FIELD_COLORS[index % FIELD_COLORS.length] as string, enabled: true, playersSee: true };
      void save(setStatusResources([...resources, entry]), rerender);
    });
    return chip;
  });
  return h("div", { class: "gm-field-shortcuts" }, h("span", { class: "hint" }, full ? `Limite de ${MAX_STATUS_RESOURCE_COUNT} itens no painel.` : "Campos das fichas desta mesa (clique para mostrar no painel):"), h("div", { class: "gm-field-chips" }, ...chips));
}

function resourcesSection(rerender: () => void): HTMLElement {
  const resources = statusResources();
  const add = h("button", { type: "button", disabled: resources.length >= MAX_STATUS_RESOURCE_COUNT }, h("i", { class: "fa-solid fa-plus", "aria-hidden": "true" }), " Adicionar barra");
  add.addEventListener("click", () => void save(setStatusResources([...resources, { id: newResourceId(), label: "Nova barra", aliases: [], color: "#22c55e", enabled: true, playersSee: true }]), rerender));
  const reset = h("button", { type: "button" }, h("i", { class: "fa-solid fa-rotate-left", "aria-hidden": "true" }), " Voltar ao padrão");
  reset.addEventListener("click", () => void save(setStatusResources(DEFAULT_STATUS_RESOURCES.map((resource) => ({ ...resource, aliases: [...resource.aliases] }))), rerender));
  const header = h("div", { class: "gm-resource-row gm-resource-header", "aria-hidden": "true" }, h("span", {}, "Ver"), h("span", {}, "Jogadores"), h("span", {}, "Nome"), h("span", {}, "Cor"), h("span", {}, "Campo na ficha"), h("span", {}));
  return section(
    "O que aparece no painel de status",
    "O painel procura na ficha uma barra (atual / máximo) ou um número com um destes nomes. \"Ver\" liga ou desliga para todos; \"Jogadores\" desmarcado deixa só você ver (ex.: sanidade secreta).",
    header,
    ...resources.map((resource, index) => resourceRow(resource, index, resources, rerender)),
    h("div", { class: "gm-rules-actions" }, add, reset),
    sheetFieldShortcuts(resources, rerender) ?? h("span", {}),
  );
}

function effectsSection(): HTMLElement {
  const open = h("button", { type: "button" }, h("i", { class: "fa-solid fa-wand-magic-sparkles", "aria-hidden": "true" }), " Gerenciar efeitos");
  open.addEventListener("click", () => void openEffectLibrary());
  return section(
    "Efeitos",
    `Envenenado, tonto, cego... ${effectDefinitions().length} efeito(s) criado(s). Cada um tem ícone, cor e pode tirar vida por turno, mandar o personagem agir por último ou limitar a visão.`,
    h("div", { class: "gm-rules-actions" }, open),
  );
}

/** GM only: the table rules for movement, combat, sheets and the status panel. */
export function buildGameMasterRulesTab(rerender: () => void): HTMLElement {
  return h("div", { class: "config-groups gm-rules" }, resourcesSection(rerender), effectsSection(), visibilitySection(rerender), buildPlayerSheetSection(rerender, checkboxRow), moveRuleSection(rerender));
}
