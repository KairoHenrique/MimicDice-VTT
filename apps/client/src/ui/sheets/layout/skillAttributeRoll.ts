import { DialogV2 } from "@tabbletop/api";
import type { SheetComponent, SheetLayout } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import { rollFromSheet } from "../sheetRoll";
import type { BoardContext } from "./boardContext";
import { allComponents } from "./sheetLayoutRules";

interface AttributeChoice {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

/** Known attributes and alternate keys (NPC sheets use `agili`). */
const ATTRIBUTE_DEFS: ReadonlyArray<{ labels: readonly string[]; keys: readonly string[] }> = [
  { labels: ["Agilidade"], keys: ["agilidade", "agili"] },
  { labels: ["Força"], keys: ["forca"] },
  { labels: ["Intelecto"], keys: ["intelecto"] },
  { labels: ["Presença"], keys: ["presenca"] },
  { labels: ["Vigor"], keys: ["vigor"] },
];

function numberComponents(layout: SheetLayout): SheetComponent[] {
  return allComponents(layout).filter((component) => component.kind === "number" && component.key);
}

function coerceAttributePoints(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return Math.max(0, Math.trunc(fallback));
}

/** Live value from the sheet (what the player typed), with initial as fallback when still empty. */
function attributePoints(context: BoardContext, key: string, component: SheetComponent | undefined, rollData: Record<string, unknown>): number {
  const fallback = typeof component?.initial === "number" ? component.initial : 0;
  const raw = context.store.read(key) ?? rollData[key] ?? context.actor?.getRollData?.()?.[key];
  return coerceAttributePoints(raw, fallback);
}

/** Prefer layout labels; fall back to the known MimicDice attribute set present on the sheet. */
export function attributesForSkillRoll(context: BoardContext, layout: SheetLayout): AttributeChoice[] {
  const rollData = { ...(context.actor?.getRollData?.() ?? {}), ...context.extraRollData(), ...context.store.values() };
  const numbers = numberComponents(layout);
  const choices: AttributeChoice[] = [];
  const usedKeys = new Set<string>();

  for (const def of ATTRIBUTE_DEFS) {
    const component = numbers.find((entry) => def.keys.includes(entry.key ?? ""));
    const key =
      component?.key ??
      def.keys.find((candidate) => context.store.read(candidate) !== undefined || rollData[candidate] !== undefined);
    if (!key || usedKeys.has(key)) continue;
    const value = attributePoints(context, key, component, rollData);
    choices.push({ key, label: component?.label?.trim() || def.labels[0]!, value });
    usedKeys.add(key);
  }

  if (choices.length > 0) return choices;

  for (const component of numbers) {
    const key = component.key!;
    if (usedKeys.has(key)) continue;
    choices.push({ key, label: component.label?.trim() || key, value: attributePoints(context, key, component, rollData) });
    usedKeys.add(key);
  }
  return choices;
}

/** 0 → 2d20 keep lowest; 1+ → Nd20 keep highest; then add skill points. */
export function skillRollFormula(attributeKey: string, skillPoints: number): string {
  const bonus = Math.trunc(skillPoints);
  const dice = `if(eq(@${attributeKey}, 0), 2d20kl, (@${attributeKey})d20kh)`;
  return bonus === 0 ? dice : `${dice} + ${bonus}`;
}

/**
 * Opens a modal to pick which attribute drives the skill roll, then rolls immediately.
 * Called when the player clicks a skill name on the sheet.
 */
export async function rollSkillWithAttribute(context: BoardContext, layout: SheetLayout, skillLabel: string, skillPoints: number): Promise<void> {
  const attributes = attributesForSkillRoll(context, layout);
  if (attributes.length === 0) {
    ui.notifications.warn("Esta ficha não tem atributos numéricos para rolar a perícia.");
    return;
  }

  const list = h("div", { class: "md-skill-attr-picker", role: "group", "aria-label": "Atributo da rolagem" });
  for (const attribute of attributes) {
    const diceHint = attribute.value === 0 ? "rola 2d20 e fica com o menor" : `rola ${attribute.value}d20 e fica com o maior`;
    const button = h(
      "button",
      {
        type: "button",
        class: "md-skill-attr-option",
        "data-key": attribute.key,
        title: `${attribute.label}: ${attribute.value} — ${diceHint}`,
      },
      h("span", { class: "md-skill-attr-text" }, h("span", { class: "md-skill-attr-name" }, attribute.label), h("span", { class: "md-skill-attr-meta" }, diceHint)),
      h("span", { class: "md-skill-attr-value", "aria-label": `Valor ${attribute.value}` }, String(attribute.value)),
    );
    list.append(button);
  }

  const content = h(
    "div",
    { class: "md-skill-attr-dialog" },
    h("p", { class: "hint" }, `Com qual atributo rolar ${skillLabel}? Usa o número que está na ficha; depois soma +${Math.trunc(skillPoints)} da perícia.`),
    list,
  );

  const chosenKey = await new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (key: string | null) => {
      if (settled) return;
      settled = true;
      resolve(key);
    };
    const dialog = new DialogV2({
      window: { title: `Perícia: ${skillLabel}` },
      position: { width: 380 },
      content,
      buttons: [{ action: "cancel", label: "Cancelar", icon: "fa-solid fa-xmark" }],
      submit: (result) => {
        if (result === "cancel" || result === null) finish(null);
      },
    });
    void dialog.render({ force: true }).then(() => {
      content.querySelectorAll<HTMLButtonElement>("button.md-skill-attr-option").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.key ?? null;
          finish(key);
          void dialog.close();
        });
      });
    });
  });

  if (!chosenKey) return;
  const attribute = attributes.find((entry) => entry.key === chosenKey);
  if (!attribute) return;
  const formula = skillRollFormula(chosenKey, skillPoints);
  rollFromSheet(context.actor, formula, `${skillLabel} (${attribute.label})`, context.extraRollData());
}
