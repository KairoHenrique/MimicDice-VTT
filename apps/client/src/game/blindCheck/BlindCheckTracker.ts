import { DialogV2 } from "@tabbletop/api";
import { h } from "../../views/dom";
import type { ActiveBlindCheck, BlindCheckResult } from "./blindCheckManager";
import { executeBlindRollForActor } from "./blindCheckManager";

let activeTrackerDialog: DialogV2 | null = null;
let activeTrackerContent: HTMLElement | null = null;
let currentTrackedCheck: ActiveBlindCheck | null = null;

function renderTrackerContent(check: ActiveBlindCheck): HTMLElement {
  const container = h("div", { class: "blind-tracker-panel" });

  const header = h(
    "div",
    { class: "blind-tracker-header" },
    h(
      "div",
      { class: "blind-tracker-meta" },
      h("span", { class: "meta-item" }, h("strong", {}, "Perícia: "), check.skillLabel),
      h("span", { class: "meta-item" }, h("strong", {}, "Atributo: "), check.attributeLabel || "Automático (melhor)"),
      check.dc ? h("span", { class: "meta-item meta-dc" }, h("strong", {}, "Dificuldade: "), `DT ${check.dc}`) : null,
    ),
  );

  const list = h("div", { class: "blind-tracker-list" });

  for (const actorId of check.targetActorIds) {
    const actor = game.actors.get(actorId);
    if (!actor) continue;

    const result = check.results.get(actorId);
    const row = h("div", { class: "blind-tracker-row", "data-actor-id": actorId });

    const card = h(
      "div",
      { class: "blind-tracker-card" },
      h("img", { class: "blind-actor-thumb", src: actor.img ?? "/icons/svg/mystery-man.svg", alt: "" }),
      h("span", { class: "blind-actor-name" }, actor.name),
    );

    const statusCol = h("div", { class: "blind-tracker-status" });

    if (result) {
      const totalSpan = h("span", { class: "blind-result-total", title: result.formula }, String(result.total));
      statusCol.append(totalSpan);

      if (result.passed !== null) {
        const badge = h(
          "span",
          { class: `blind-result-badge ${result.passed ? "pass" : "fail"}` },
          result.passed ? "Passou" : "Falhou",
        );
        statusCol.append(badge);
      }
    } else {
      const pendingSpan = h("span", { class: "blind-pending-label" }, "⏳ Aguardando...");
      const rollBtn = h(
        "button",
        {
          type: "button",
          class: "blind-gm-roll-btn",
          title: "Rolar por este personagem agora",
        },
        h("i", { class: "fa-solid fa-dice-d20", "aria-hidden": "true" }),
        " Rolar",
      );

      rollBtn.addEventListener("click", () => {
        rollBtn.disabled = true;
        void executeBlindRollForActor(actorId);
      });

      statusCol.append(pendingSpan, rollBtn);
    }

    row.append(card, statusCol);
    list.append(row);
  }

  const actions = h("div", { class: "blind-tracker-actions" });
  const rollAllBtn = h(
    "button",
    {
      type: "button",
      class: "blind-roll-all-btn",
    },
    h("i", { class: "fa-solid fa-dice", "aria-hidden": "true" }),
    " Rolar por todos pendentes",
  );

  rollAllBtn.addEventListener("click", async () => {
    rollAllBtn.disabled = true;
    for (const actorId of check.targetActorIds) {
      if (!check.results.has(actorId)) {
        await executeBlindRollForActor(actorId);
      }
    }
  });

  actions.append(rollAllBtn);
  container.append(header, list, actions);
  return container;
}

export function openBlindCheckTracker(check: ActiveBlindCheck): void {
  currentTrackedCheck = check;
  if (activeTrackerDialog) {
    try {
      void activeTrackerDialog.close();
    } catch {}
  }

  activeTrackerContent = renderTrackerContent(check);

  activeTrackerDialog = new DialogV2({
    window: {
      title: `🎲 Teste às Cegas: ${check.skillLabel}`,
      icon: "fa-solid fa-eye-slash",
    },
    position: { width: 500 },
    content: activeTrackerContent,
    buttons: [
      {
        action: "close",
        label: "Fechar",
        icon: "fa-solid fa-xmark",
      },
    ],
  });

  void activeTrackerDialog.render({ force: true });
}

export function updateBlindCheckTrackerRoll(check: ActiveBlindCheck, result: BlindCheckResult): void {
  if (!activeTrackerContent || currentTrackedCheck?.checkId !== check.checkId) return;

  const row = activeTrackerContent.querySelector(`[data-actor-id="${result.actorId}"]`);
  if (!row) return;

  const statusCol = row.querySelector(".blind-tracker-status");
  if (!statusCol) return;

  statusCol.replaceChildren();

  const totalSpan = h("span", { class: "blind-result-total", title: result.formula }, String(result.total));
  statusCol.append(totalSpan);

  if (result.passed !== null) {
    const badge = h(
      "span",
      { class: `blind-result-badge ${result.passed ? "pass" : "fail"}` },
      result.passed ? "Passou" : "Falhou",
    );
    statusCol.append(badge);
  }
}
