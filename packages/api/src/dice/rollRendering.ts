import type { PlainObject } from "@tabbletop/common";
import { escapeHTML } from "../utils/miscUtils";

export interface TooltipPart {
  formula: string;
  total: number | string | undefined;
  flavor: string;
  rolls: Array<{ result: string; classes: string }>;
}

export interface RollRenderData {
  formula: string;
  flavor: string | null;
  total: number | string;
  tooltip: string;
  isPrivate: boolean;
}

function renderTooltipPart(part: TooltipPart): string {
  const flavor = part.flavor ? `<span class="part-flavor">${escapeHTML(part.flavor)}</span>` : "";
  const rolls = part.rolls.map((roll) => `<li class="roll ${escapeHTML(roll.classes)}">${escapeHTML(roll.result)}</li>`).join("");
  return (
    `<section class="tooltip-part"><div class="dice">` +
    `<header class="part-header flexrow"><span class="part-formula">${escapeHTML(part.formula)}</span>${flavor}` +
    `<span class="part-total">${escapeHTML(String(part.total ?? ""))}</span></header>` +
    `<ol class="dice-rolls">${rolls}</ol></div></section>`
  );
}

export function renderTooltip(parts: PlainObject[]): string {
  if (parts.length === 0) return "";
  return `<div class="dice-tooltip">${parts.map((part) => renderTooltipPart(part as unknown as TooltipPart)).join("")}</div>`;
}

export function renderRollCard(data: RollRenderData): string {
  const flavor = data.flavor ? `<div class="dice-flavor">${escapeHTML(data.flavor)}</div>` : "";
  return (
    `<div class="dice-roll" data-action="expandRoll">${flavor}<div class="dice-result">` +
    `<div class="dice-formula">${escapeHTML(data.formula)}</div>${data.tooltip}` +
    `<h4 class="dice-total">${escapeHTML(String(data.total))}</h4></div></div>`
  );
}
