import { findHelpTopic } from "./helpTopics";
import { HelpDialog } from "./HelpDialog";

const TYPING_SELECTOR = "input, textarea, select, [contenteditable='true']";
const REGION_TOPICS: ReadonlyArray<readonly [string, string]> = [
  ["#navigation", "navigation"],
  ["#players", "players"],
  ["#chat", "tab:chat"],
  ["#combat", "tab:combat"],
];

/** Which help topic an element belongs to, from explicit `data-help` down to the region it sits in. */
export function resolveHelpTopic(target: Element): string | null {
  const explicit = target.closest<HTMLElement>("[data-help]")?.dataset.help;
  if (explicit) return explicit;
  const tool = target.closest<HTMLElement>("#scene-controls [data-tool]")?.dataset.tool;
  if (tool && findHelpTopic(`tool:${tool}`)) return `tool:${tool}`;
  const control = tool ? document.querySelector<HTMLElement>("#scene-controls [data-control].active")?.dataset.control : target.closest<HTMLElement>("#scene-controls [data-control]")?.dataset.control;
  if (control) return `control:${control}`;
  const tab = target.closest<HTMLElement>(".sidebar-tabs [data-tab]")?.dataset.tab;
  if (tab) return `tab:${tab}`;
  for (const [selector, topicId] of REGION_TOPICS) if (target.closest(selector)) return topicId;
  return null;
}

/**
 * Shift+click on any interface control opens its help instead of using it. The board is left alone,
 * since Shift+click there selects several tokens, and so are text fields, where Shift+click selects text.
 */
export function registerContextHelp(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (!event.shiftKey || !(event.target instanceof Element)) return;
      if (event.target.closest(TYPING_SELECTOR) || event.target.closest("#board")) return;
      const topicId = resolveHelpTopic(event.target);
      if (!topicId || !findHelpTopic(topicId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      HelpDialog.open(topicId);
    },
    true,
  );
}
