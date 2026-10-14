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
import { parseAliases } from "../status/statusResourceMatching";

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
  return h("div", { class: "gm-resource-row" }, enabled, label, color, aliases, remove);
}

function resourcesSection(rerender: () => void): HTMLElement {
  const resources = statusResources();
  const add = h("button", { type: "button", disabled: resources.length >= MAX_STATUS_RESOURCE_COUNT }, h("i", { class: "fa-solid fa-plus", "aria-hidden": "true" }), " Adicionar barra");
  add.addEventListener("click", () => void save(setStatusResources([...resources, { id: newResourceId(), label: "Nova barra", aliases: [], color: "#22c55e", enabled: true }]), rerender));
  const reset = h("button", { type: "button" }, h("i", { class: "fa-solid fa-rotate-left", "aria-hidden": "true" }), " Voltar ao padrão");
  reset.addEventListener("click", () => void save(setStatusResources(DEFAULT_STATUS_RESOURCES.map((resource) => ({ ...resource, aliases: [...resource.aliases] }))), rerender));
  const header = h("div", { class: "gm-resource-row gm-resource-header", "aria-hidden": "true" }, h("span", {}, "Ver"), h("span", {}, "Nome"), h("span", {}, "Cor"), h("span", {}, "Campo na ficha (barra)"), h("span", {}));
  return section(
    "Vida, PE e sanidade",
    "O painel procura na ficha uma barra (atual / máximo) com um destes nomes. Desmarque para esconder, por exemplo, a sanidade se sua mesa não usa.",
    header,
    ...resources.map((resource, index) => resourceRow(resource, index, resources, rerender)),
    h("div", { class: "gm-rules-actions" }, add, reset),
  );
}

/** GM only: the table rules for movement, combat and the status panel. */
export function buildGameMasterRulesTab(rerender: () => void): HTMLElement {
  return h("div", { class: "config-groups gm-rules" }, resourcesSection(rerender), visibilitySection(rerender), moveRuleSection(rerender));
}
