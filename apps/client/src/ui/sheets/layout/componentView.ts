import type { SheetComponent } from "@tabbletop/protocol";
import { h } from "../../../views/dom";
import type { BoardContext } from "./boardContext";
import { storesValue } from "./componentCatalog";
import { formatDerived } from "./computedValues";
import { buildListControl } from "./listComponentView";
import { buildSkillsControl } from "./skillsComponentView";
import { buildValueControl, sheetRollButton } from "./valueComponentViews";

const LABELLESS_KINDS = new Set(["title", "label", "image", "portrait", "divider", "roll", "checkbox", "skills"]);

function staticContent(context: BoardContext, component: SheetComponent): HTMLElement | null {
  switch (component.kind) {
    case "title":
      return h("h3", { class: "md-c-title" }, component.content ?? component.label ?? "");
    case "label":
      return h("p", { class: "md-c-label" }, component.content ?? "");
    case "divider":
      return h("hr", { class: "md-c-divider", style: component.style?.accent ? `border-color:${component.style.accent}` : undefined });
    case "image":
      return component.src ? h("img", { class: "md-c-image", src: component.src, alt: component.label ?? "", loading: "lazy", decoding: "async" }) : h("div", { class: "md-c-image placeholder" }, h("i", { class: "fa-solid fa-image" }));
    case "portrait":
      return h("img", { class: "md-c-image portrait", src: context.actor.img, alt: context.actor.name, loading: "lazy", decoding: "async" });
    case "computed": {
      const value = component.key ? context.derived[component.key] : undefined;
      return h("output", { class: "md-c-computed", title: component.formula ?? "" }, formatDerived(value));
    }
    case "roll": {
      const formula = component.formula?.trim();
      if (!formula) return h("p", { class: "hint" }, "Sem fórmula.");
      return sheetRollButton(context, component, formula, [h("i", { class: "fa-solid fa-dice-d20" }), h("span", {}, component.label || formula)]);
    }
    default:
      return null;
  }
}

function inlineStyle(component: SheetComponent): string | undefined {
  const style = component.style;
  if (!style) return undefined;
  const rules: string[] = [];
  if (style.text) rules.push(`color:${style.text}`);
  if (style.background) rules.push(`background:${style.background}`);
  if (style.accent) rules.push(`--md-accent:${style.accent}`);
  return rules.length > 0 ? rules.join(";") : undefined;
}

function styleClasses(component: SheetComponent): string {
  const style = component.style ?? {};
  const classes = [`md-c`, `md-c--${component.kind}`, `md-size-${style.size ?? "md"}`, `md-align-${style.align ?? "left"}`];
  if (style.bold) classes.push("md-bold");
  if (style.italic) classes.push("md-italic");
  if (style.border) classes.push("md-bordered");
  if (component.gmOnly) classes.push("md-gm-only");
  return classes.join(" ");
}

export function gridPlacement(component: Pick<SheetComponent, "x" | "y" | "w" | "h">): string {
  return `grid-column:${component.x + 1} / span ${component.w};grid-row:${component.y + 1} / span ${component.h}`;
}

/** Inner part of a component (label + control), shared by the play view and the editor preview. */
export function buildComponentBody(context: BoardContext, component: SheetComponent): HTMLElement {
  const control =
    component.kind === "list"
      ? buildListControl(context, component)
      : component.kind === "skills"
        ? buildSkillsControl(context, component)
        : storesValue(component.kind)
          ? buildValueControl(context, component)
          : staticContent(context, component);
  const showLabel = !LABELLESS_KINDS.has(component.kind) && !component.style?.hideLabel && component.label;
  const label = showLabel ? h("span", { class: "md-field-label" }, component.label as string) : null;
  return h("div", { class: styleClasses(component), style: inlineStyle(component), title: component.hint ?? "" }, label, control);
}

/** Component placed on the play grid. */
export function buildPlacedComponent(context: BoardContext, component: SheetComponent): HTMLElement {
  return h("div", { class: "md-cell", style: gridPlacement(component), "data-component-id": component.id }, buildComponentBody(context, component));
}
