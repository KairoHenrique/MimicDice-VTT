import type { ApplicationConfiguration } from "@tabbletop/api";
import { h } from "../../views/dom";
import { DomApplication } from "../DomApplication";
import { findHelpTopic, helpTopicsFor, type HelpTopic } from "./helpTopics";

const DEFAULT_TOPIC_ID = "start";

/** The full tutorial: topic index on the left, the chosen topic on the right. */
export class HelpDialog extends DomApplication {
  static override DEFAULT_OPTIONS: Partial<ApplicationConfiguration> = {
    id: "help-dialog",
    classes: ["help-dialog"],
    window: { title: "Tutorial", frame: true, positioned: true, icon: false, controls: [], minimizable: true, resizable: true, contentTag: "section", contentClasses: [] },
    position: { width: 720, height: 560 },
  };

  #topicId = DEFAULT_TOPIC_ID;

  static open(topicId: string = DEFAULT_TOPIC_ID): void {
    const existing = Array.from(foundry.applications.instances.values()).find((app: unknown) => app instanceof HelpDialog) as HelpDialog | undefined;
    const dialog = existing ?? new HelpDialog();
    dialog.#topicId = findHelpTopic(topicId) ? topicId : DEFAULT_TOPIC_ID;
    void dialog.render({ force: true });
  }

  buildContent(): Node[] {
    const topics = helpTopicsFor(game.user?.isGM === true);
    const current = topics.find((topic) => topic.id === this.#topicId) ?? topics[0];
    return [this.#buildIndex(topics, current), this.#buildTopic(current)];
  }

  #buildIndex(topics: readonly HelpTopic[], current: HelpTopic): HTMLElement {
    const list = h("ul", { class: "help-index", role: "list" });
    for (const topic of topics) {
      const isCurrent = topic.id === current.id;
      const button = h("button", { type: "button", class: isCurrent ? "active" : "", "aria-current": isCurrent ? "true" : "false" }, h("i", { class: topic.icon, "aria-hidden": "true" }), ` ${topic.title}`);
      button.addEventListener("click", () => {
        this.#topicId = topic.id;
        void this.render();
      });
      list.append(h("li", {}, button));
    }
    return h("nav", { class: "help-nav", "aria-label": "Tópicos do tutorial" }, list);
  }

  #buildTopic(topic: HelpTopic): HTMLElement {
    return h(
      "article",
      { class: "help-topic" },
      h("h2", {}, h("i", { class: topic.icon, "aria-hidden": "true" }), ` ${topic.title}`),
      h("p", { class: "help-summary" }, topic.summary),
      h("ol", { class: "help-steps" }, ...topic.steps.map((step) => h("li", {}, step))),
      h("p", { class: "hint help-tip" }, h("kbd", {}, "Shift"), " + clique em qualquer botão mostra a ajuda dele."),
    );
  }
}
