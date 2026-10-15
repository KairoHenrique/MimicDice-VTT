import { DialogV2 } from "@tabbletop/api";
import { MAX_PERCEPTION, parseTurnsInput, PERCEPTION_DC_FLAG, readConcealment, TRAP_FLAG, trapSchema, type PerceptionScores, type Trap } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { effectDefinitions } from "../../ui/effects/effectStore";
import { applyPerceptionRolls, perceptionScores, playerCharacters, type PerceptionFinding, type PerceptionScope } from "./perception";

interface TrapControls {
  enabled: HTMLInputElement;
  name: HTMLInputElement;
  message: HTMLInputElement;
  effect: HTMLSelectElement;
  turns: HTMLInputElement;
}

function numberInput(name: string, value: number | null, label: string, max: number): HTMLInputElement {
  return h("input", { type: "number", name, min: 0, max, step: 1, value: value === null ? "" : String(value), "aria-label": label, class: "md-conceal-number" });
}

function trapSection(trap: Trap | null): { section: HTMLElement; controls: TrapControls } {
  const enabled = h("input", { type: "checkbox", name: "trapEnabled", checked: trap !== null });
  const name = h("input", { type: "text", name: "trapName", maxLength: 60, value: trap?.name ?? "Armadilha", "aria-label": "Nome da armadilha" });
  const message = h("input", { type: "text", name: "trapMessage", maxLength: 200, value: trap?.message ?? "", placeholder: "Ex.: o chão cede e espinhos surgem", "aria-label": "Mensagem no chat" });
  const effect = h("select", { name: "trapEffect", "aria-label": "Efeito aplicado" }, h("option", { value: "" }, "(nenhum efeito)"), ...effectDefinitions().map((definition) => h("option", { value: definition.id, selected: definition.id === trap?.effectId }, definition.name)));
  const turns = h("input", { type: "text", name: "trapTurns", maxLength: 40, value: String(trap?.effectTurns ?? 3), placeholder: "3 ou 1d4", "aria-label": "Duração do efeito em turnos (número ou dados)", class: "md-conceal-number" });
  const details = h(
    "div",
    { class: "md-conceal-grid" },
    h("label", {}, "Nome", name),
    h("label", {}, "Mensagem no chat", message),
    h("label", {}, "Efeito", effect),
    h("label", {}, "Dura (turnos ou dados)", turns),
  );
  const sync = () => (details.hidden = !enabled.checked);
  enabled.addEventListener("change", sync);
  sync();
  const section = h(
    "fieldset",
    { class: "md-conceal-section" },
    h("legend", {}, "Armadilha"),
    h("label", { class: "md-conceal-check" }, enabled, " Isto é uma armadilha"),
    h("p", { class: "hint" }, "Fica invisível para os jogadores até alguém pisar nela (ou você ativar). Ao disparar, aparece com a imagem do tile, avisa no chat e aplica o efeito em quem pisou."),
    details,
  );
  return { section, controls: { enabled, name, message, effect, turns } };
}

function rollsSection(lastRolls: PerceptionScores): { section: HTMLElement; inputs: Map<string, HTMLInputElement> } {
  const inputs = new Map<string, HTMLInputElement>();
  const rows = playerCharacters().map((actor) => {
    const input = numberInput(`score-${actor.id}`, null, `Percepção de ${actor.name}`, MAX_PERCEPTION);
    const last = lastRolls[actor.id];
    if (last !== undefined) input.placeholder = `último: ${last}`;
    inputs.set(actor.id, input);
    return h("label", { class: "md-conceal-score" }, h("span", { class: "md-conceal-score-name", title: actor.name }, actor.name), input);
  });
  const section = h(
    "fieldset",
    { class: "md-conceal-section" },
    h("legend", {}, "Resultado do teste"),
    h("p", { class: "hint" }, "Digite só de quem rolou agora. Vazio: não rolou."),
    rows.length ? h("div", { class: "md-conceal-scores" }, ...rows) : h("p", { class: "hint" }, "Nenhum personagem de jogador ainda."),
  );
  return { section, inputs };
}

function readScore(input: HTMLInputElement): number | null {
  if (input.value.trim() === "") return null;
  const value = Math.round(Number(input.value));
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_PERCEPTION) : null;
}

function readTrap(controls: TrapControls, previous: Trap | null): Trap | null {
  if (!controls.enabled.checked) return null;
  const effectTurns = parseTurnsInput(controls.turns.value);
  if (effectTurns === null) ui.notifications.warn("Duração inválida: use um número ou dados, como 3 ou 1d4. Ficou 3 turnos.");
  const parsed = trapSchema.safeParse({
    name: controls.name.value || "Armadilha",
    message: controls.message.value,
    effectId: controls.effect.value || null,
    effectTurns: effectTurns ?? 3,
    triggered: previous?.triggered ?? false,
  });
  return parsed.success ? parsed.data : null;
}

/** GM: perception DC, trap settings and the characters' perception for one tile or note. */
export async function concealmentDialog(document: any): Promise<void> {
  if (!game.user.isGM) return;
  const current = readConcealment(document._source?.flags?.world);
  const isTile = document.documentName === "Tile";
  const dc = numberInput("dc", current.perceptionDc, "DT de percepção", MAX_PERCEPTION);
  const trap = isTile ? trapSection(current.trap) : null;
  const content = h(
    "div",
    { class: "md-conceal" },
    h(
      "fieldset",
      { class: "md-conceal-section" },
      h("legend", {}, "Percepção"),
      h("label", { class: "md-conceal-inline" }, "DT de percepção", dc),
      h("p", { class: "hint" }, "Só aparece para quem rolar percepção igual ou maior com isto à vista do token. Vazio ou 0: todos veem. Anote a rolagem em \"Anotar percepção\", na barra de cima."),
    ),
    trap?.section ?? null,
  );
  const confirmed = await DialogV2.prompt({ window: { title: isTile ? "Percepção e armadilha" : "Percepção da nota" }, position: { width: 460 } as any, content, ok: { label: "Salvar", icon: "fa-solid fa-floppy-disk", callback: () => true } });
  if (!confirmed) return;
  const dcValue = readScore(dc);
  const update: Record<string, unknown> = dcValue ? { [`flags.world.${PERCEPTION_DC_FLAG}`]: dcValue } : { [`flags.world.-=${PERCEPTION_DC_FLAG}`]: null };
  if (trap) {
    const nextTrap = readTrap(trap.controls, current.trap);
    Object.assign(update, nextTrap ? { [`flags.world.${TRAP_FLAG}`]: nextTrap } : { [`flags.world.-=${TRAP_FLAG}`]: null });
  }
  await document.update(update);
}

const SCOPE_HINTS: Record<PerceptionScope, string> = {
  map: "Vale para o mapa todo: objetos, notas, armadilhas e itens de baú com DT igual ou menor que o resultado ficam percebidos. Cada um só aparece quando o token chegar a ver aquele lugar; no escuro ou fora da visão continua escondido.",
  sight: "Vale só para o que o token de cada um está vendo agora. O resto do mapa continua escondido até rolarem de novo com aquilo à vista.",
};

function scopeSwitch(): { section: HTMLElement; scope: () => PerceptionScope } {
  const toggle = h("input", { type: "checkbox", role: "switch", name: "wholeMap", checked: true, class: "md-switch-input", "aria-describedby": "md-perception-scope-hint" });
  const hint = h("p", { class: "hint", id: "md-perception-scope-hint" });
  const scope = (): PerceptionScope => (toggle.checked ? "map" : "sight");
  const sync = () => (hint.textContent = SCOPE_HINTS[scope()]);
  toggle.addEventListener("change", sync);
  sync();
  const section = h("div", { class: "md-conceal-scope" }, h("label", { class: "md-switch" }, toggle, h("span", { class: "md-switch-track", "aria-hidden": "true" }), "Valer para o mapa todo"), hint);
  return { section, scope };
}

/** GM: writes down a perception roll, for the whole map or only what each character's token sees right now. */
export async function perceptionScoresDialog(): Promise<void> {
  if (!game.user.isGM) return;
  if (!canvas?.ready || !canvas.scene) {
    ui.notifications.warn("Abra uma cena para anotar a percepção.");
    return;
  }
  const rolls = rollsSection(perceptionScores());
  const scope = scopeSwitch();
  const content = h("div", { class: "md-conceal" }, rolls.section, scope.section);
  const confirmed = await DialogV2.prompt({ window: { title: `Anotar percepção: ${canvas.scene.name ?? "cena"}` }, position: { width: 440 } as any, content, ok: { label: "Anotar", icon: "fa-solid fa-eye", callback: () => true } });
  if (!confirmed) return;
  const typed = typedRolls(rolls.inputs);
  if (Object.keys(typed).length === 0) return;
  const chosenScope = scope.scope();
  reportFindings(await applyPerceptionRolls(typed, chosenScope), chosenScope);
}

function typedRolls(inputs: Map<string, HTMLInputElement>): PerceptionScores {
  const rolls: PerceptionScores = {};
  for (const [actorId, input] of inputs) {
    const value = readScore(input);
    if (value !== null) rolls[actorId] = value;
  }
  return rolls;
}

function findingLine(finding: PerceptionFinding, scope: PerceptionScope): string {
  if (!finding.hasToken) return `${finding.actorName}: sem token nesta cena, nada mudou.`;
  if (scope === "map") return finding.inSight === 0 ? `${finding.actorName}: nenhum segredo no mapa.` : `${finding.actorName}: achou ${finding.found} de ${finding.inSight} no mapa.`;
  if (finding.inSight === 0) return `${finding.actorName}: nenhum segredo à vista.`;
  return `${finding.actorName}: achou ${finding.found} de ${finding.inSight} à vista.`;
}

function reportFindings(findings: PerceptionFinding[], scope: PerceptionScope): void {
  if (findings.length) ui.notifications.info(findings.map((finding) => findingLine(finding, scope)).join(" "));
}
