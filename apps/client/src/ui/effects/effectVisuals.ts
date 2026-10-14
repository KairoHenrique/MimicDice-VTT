import type { TokenBadge } from "@tabbletop/api";
import { type AppliedEffect, type EffectDefinition, isFontAwesomeIcon } from "@tabbletop/protocol";
import { h } from "../../views/dom";

type EffectLook = Pick<EffectDefinition, "name" | "icon" | "color">;

/** Icon of an effect: a Font Awesome glyph or the emoji as plain text. */
export function effectIcon(effect: Pick<EffectDefinition, "icon">): HTMLElement {
  if (isFontAwesomeIcon(effect.icon)) return h("i", { class: effect.icon, "aria-hidden": "true" });
  return h("span", { class: "md-effect-emoji", "aria-hidden": "true" }, effect.icon);
}

export function effectTitle(effect: AppliedEffect): string {
  const turns = effect.turnsLeft === 1 ? "1 turno" : `${effect.turnsLeft} turnos`;
  return effect.description ? `${effect.name} (${turns}): ${effect.description}` : `${effect.name} (${turns})`;
}

/** Round colored chip with the icon; the name and remaining turns are in its tooltip and accessible label. */
export function effectChip(effect: AppliedEffect, extraClass = ""): HTMLElement {
  const title = effectTitle(effect);
  return h(
    "span",
    { class: `md-effect-chip ${extraClass}`.trim(), style: `--effect-color: ${effect.color}`, title, role: "img", "aria-label": title },
    effectIcon(effect),
    h("span", { class: "md-effect-turns", "aria-hidden": "true" }, String(effect.turnsLeft)),
  );
}

export function effectChipRow(effects: readonly AppliedEffect[], extraClass = ""): HTMLElement | null {
  if (effects.length === 0) return null;
  return h("span", { class: `md-effect-chips ${extraClass}`.trim() }, ...effects.map((effect) => effectChip(effect)));
}

export function effectLabel(effect: EffectLook): HTMLElement {
  return h("span", { class: "md-effect-label", style: `--effect-color: ${effect.color}` }, h("span", { class: "md-effect-dot" }, effectIcon(effect)), h("span", {}, effect.name));
}

const glyphCache = new Map<string, Omit<TokenBadge, "color">>();

/** The canvas cannot use CSS classes, so the glyph and font of a Font Awesome icon are read from the page once. */
function fontAwesomeGlyph(icon: string): Omit<TokenBadge, "color"> {
  const cached = glyphCache.get(icon);
  if (cached) return cached;
  const probe = h("i", { class: icon, "aria-hidden": "true", style: "position:absolute;visibility:hidden;pointer-events:none" });
  document.body.append(probe);
  const style = getComputedStyle(probe, "::before");
  const text = /^(["'])(.+?)\1/u.exec(style.content)?.[2] ?? "";
  const glyph = text ? { text, fontFamily: style.fontFamily, fontWeight: style.fontWeight } : { text: "?" };
  probe.remove();
  glyphCache.set(icon, glyph);
  if (glyph.fontFamily) redrawWhenFontLoads(`${glyph.fontWeight} 16px ${glyph.fontFamily}`, glyph.text);
  return glyph;
}

const pendingFonts = new Set<string>();

function redrawWhenFontLoads(font: string, sample: string): void {
  if (pendingFonts.has(font) || document.fonts.check(font, sample)) return;
  pendingFonts.add(font);
  void document.fonts.load(font, sample).then(() => {
    for (const token of canvas?.tokens?.placeables ?? []) token.redrawBadges?.();
  });
}

export function tokenBadge(effect: EffectLook): TokenBadge {
  const glyph = isFontAwesomeIcon(effect.icon) ? fontAwesomeGlyph(effect.icon) : { text: effect.icon };
  return { ...glyph, color: effect.color };
}
