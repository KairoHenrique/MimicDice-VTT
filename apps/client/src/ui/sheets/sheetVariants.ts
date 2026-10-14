import { DialogV2 } from "@tabbletop/api";
import { MAX_SHEET_VARIANTS, SHEET_VARIANTS_FLAG, sheetVariantsSchema, type SheetLayout, type SheetTemplate, type SheetVariant } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { saveActorLayout } from "../actors/actorAssignment";
import { actorRole, MIMICDICE_FLAG_SCOPE } from "../actors/actorRoles";
import { cloneLayoutWithNewIds, EMPTY_LAYOUT, readLayout } from "./layout/sheetLayoutRules";
import { templatesForRole } from "./layout/templateDialogs";

export interface ReadyVariant {
  id: string;
  name: string;
  layout: SheetLayout;
  /** Exactly what the GM stored, so the server recognises it when a player switches to it. */
  stored: SheetVariant["layout"];
}

/** Sheet models the GM handed to this actor; a player switches only between these. */
export function actorVariants(actor: any): ReadyVariant[] {
  const parsed = sheetVariantsSchema.safeParse(actor.getFlag?.(MIMICDICE_FLAG_SCOPE, SHEET_VARIANTS_FLAG) ?? []);
  if (!parsed.success) return [];
  return parsed.data.map((variant) => ({ id: variant.id, name: variant.name, layout: readLayout(variant.layout) ?? EMPTY_LAYOUT, stored: variant.layout }));
}

async function setActorVariants(actor: any, templates: readonly SheetTemplate[]): Promise<void> {
  const current = new Map(actorVariants(actor).map((variant) => [variant.id, variant]));
  const variants = templates.slice(0, MAX_SHEET_VARIANTS).map((template) => ({
    id: template.id,
    name: template.name.slice(0, 60),
    layout: current.get(template.id)?.stored ?? cloneLayoutWithNewIds(template.layout),
  }));
  await actor.update({ [`flags.${MIMICDICE_FLAG_SCOPE}.${SHEET_VARIANTS_FLAG}`]: sheetVariantsSchema.parse(variants) });
}

/** GM: pick up to five models this character's player may switch between. */
export async function chooseActorVariantsDialog(actor: any): Promise<void> {
  const templates = templatesForRole(actorRole(actor));
  const granted = new Set(actorVariants(actor).map((variant) => variant.id));
  const boxes = templates.map((template) => h("input", { type: "checkbox", value: template.id, checked: granted.has(template.id) }));
  const counter = h("p", { class: "hint", "aria-live": "polite" });
  const refreshLimit = () => {
    const checked = boxes.filter((box) => box.checked).length;
    counter.textContent = `${checked} de ${MAX_SHEET_VARIANTS} modelos escolhidos.`;
    for (const box of boxes) box.disabled = !box.checked && checked >= MAX_SHEET_VARIANTS;
  };
  for (const box of boxes) box.addEventListener("change", refreshLimit);
  refreshLimit();
  const list = h("div", { class: "md-template-list" }, ...templates.map((template, index) => h("label", { class: "md-check-row" }, boxes[index], h("span", {}, template.name))));
  const content = h(
    "div",
    {},
    h("p", { class: "hint" }, `O jogador de ${actor.name} poderá trocar a ficha só entre os modelos marcados. Nenhum marcado: ele não troca de modelo.`),
    list,
    counter,
  );
  const confirmed = await DialogV2.prompt({ window: { title: "Modelos do jogador" }, position: { width: 440 } as any, content, ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => true } });
  if (confirmed !== true) return;
  const chosen = templates.filter((_, index) => boxes[index]?.checked);
  await setActorVariants(actor, chosen);
  ui.notifications.info(chosen.length > 0 ? `${chosen.length} modelo(s) liberado(s) para o jogador.` : "O jogador não troca mais de modelo.");
}

/** Player: switch to one of the models the GM handed over. */
export async function chooseVariantDialog(actor: any): Promise<void> {
  const variants = actorVariants(actor);
  if (variants.length === 0) return;
  const radios = variants.map((variant, index) => h("input", { type: "radio", name: "variant", value: variant.id, checked: index === 0 }));
  const content = h(
    "div",
    {},
    h("p", { class: "hint" }, "Os valores preenchidos com o mesmo nome continuam na ficha nova."),
    h("div", { class: "md-template-list" }, ...variants.map((variant, index) => h("label", { class: "md-check-row" }, radios[index], h("span", {}, variant.name)))),
  );
  const chosenId = await DialogV2.prompt({ window: { title: "Trocar modelo de ficha" }, content, ok: { label: "Trocar", icon: "fa-solid fa-repeat", callback: () => radios.find((radio) => radio.checked)?.value ?? null } });
  const chosen = variants.find((variant) => variant.id === chosenId);
  if (!chosen) return;
  await saveActorLayout(actor, chosen.stored as SheetLayout);
  ui.notifications.info(`Ficha trocada para "${chosen.name}".`);
}
