import { DialogV2 } from "@tabbletop/api";
import { MAX_PERCEPTION, MAX_TRAP_TURNS, PERCEPTION_DC_FLAG, readConcealment, TRAP_FLAG, trapSchema, type PerceptionScores, type Trap } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { effectDefinitions } from "../../ui/effects/effectStore";
import { perceptionScores, playerCharacters, savePerceptionScores } from "./perception";

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
  const turns = numberInput("trapTurns", trap?.effectTurns ?? 3, "Duração do efeito em turnos", MAX_TRAP_TURNS);
  const details = h(
    "div",
    { class: "md-conceal-grid" },
    h("label", {}, "Nome", name),
    h("label", {}, "Mensagem no chat", message),
    h("label", {}, "Efeito", effect),
    h("label", {}, "Dura (turnos)", turns),
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

function scoresSection(scores: PerceptionScores): { section: HTMLElement; inputs: Map<string, HTMLInputElement> } {
  const inputs = new Map<string, HTMLInputElement>();
  const rows = playerCharacters().map((actor) => {
    const input = numberInput(`score-${actor.id}`, scores[actor.id] ?? null, `Percepção de ${actor.name}`, MAX_PERCEPTION);
    inputs.set(actor.id, input);
    return h("label", { class: "md-conceal-score" }, h("span", { class: "md-conceal-score-name", title: actor.name }, actor.name), input);
  });
  const section = h(
    "fieldset",
    { class: "md-conceal-section" },
    h("legend", {}, "Percepção dos personagens"),
    h("p", { class: "hint" }, "Anote o resultado do teste de percepção de cada um. Vazio: ainda não rolou."),
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
  const parsed = trapSchema.safeParse({
    name: controls.name.value || "Armadilha",
    message: controls.message.value,
    effectId: controls.effect.value || null,
    effectTurns: Math.round(Number(controls.turns.value)) || 3,
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
  const scores = scoresSection(perceptionScores());
  const content = h(
    "div",
    { class: "md-conceal" },
    h(
      "fieldset",
      { class: "md-conceal-section" },
      h("legend", {}, "Percepção"),
      h("label", { class: "md-conceal-inline" }, "DT de percepção", dc),
      h("p", { class: "hint" }, "Só quem tiver percepção igual ou maior vê isto no mapa. Vazio ou 0: todos veem."),
    ),
    trap?.section ?? null,
    scores.section,
  );
  const confirmed = await DialogV2.prompt({ window: { title: isTile ? "Percepção e armadilha" : "Percepção da nota" }, position: { width: 460 } as any, content, ok: { label: "Salvar", icon: "fa-solid fa-floppy-disk", callback: () => true } });
  if (!confirmed) return;
  const dcValue = readScore(dc);
  const update: Record<string, unknown> = dcValue ? { [`flags.world.${PERCEPTION_DC_FLAG}`]: dcValue } : { [`flags.world.-=${PERCEPTION_DC_FLAG}`]: null };
  if (trap) {
    const nextTrap = readTrap(trap.controls, current.trap);
    Object.assign(update, nextTrap ? { [`flags.world.${TRAP_FLAG}`]: nextTrap } : { [`flags.world.-=${TRAP_FLAG}`]: null });
  }
  await Promise.all([document.update(update), savePerceptionScores(mergedScores(perceptionScores(), scores.inputs))]);
}

/** Listed characters take the typed value (a cleared field forgets it); characters not listed keep theirs. */
function mergedScores(stored: PerceptionScores, inputs: Map<string, HTMLInputElement>): PerceptionScores {
  const merged: PerceptionScores = { ...stored };
  for (const [actorId, input] of inputs) {
    const value = readScore(input);
    if (value === null) delete merged[actorId];
    else merged[actorId] = value;
  }
  return merged;
}
