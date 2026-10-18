import { DialogV2 } from "@tabbletop/api";
import type { GroupBlindCheckBroadcast } from "@tabbletop/protocol";
import { h } from "../../views/dom";
import { submitPlayerBlindRoll } from "./blindCheckManager";

export function showPlayerBlindPrompt(broadcast: GroupBlindCheckBroadcast, targetActors: any[]): void {
  const authorName = broadcast.authorName ? broadcast.authorName.trim() : "O mestre";
  const customMessage = broadcast.message?.trim();

  const content = h("div", { class: "player-blind-prompt" });

  if (customMessage) {
    content.append(h("blockquote", { class: "blind-gm-quote" }, `"${customMessage}"`));
  }

  content.append(
    h(
      "p",
      { class: "blind-prompt-desc" },
      `${authorName} pediu um teste secreto às cegas para o seu personagem. Você não sabe qual perícia está sendo avaliada e o resultado será revelado apenas para o mestre.`,
    ),
  );

  const actorList = h("div", { class: "blind-actor-list" });

  let dialog: DialogV2 | null = null;
  let remaining = targetActors.length;

  for (const actor of targetActors) {
    const portrait = h("img", { class: "blind-actor-thumb", src: actor.img ?? "/icons/svg/mystery-man.svg", alt: "" });
    const name = h("span", { class: "blind-actor-name" }, actor.name);

    const rollBtn = h(
      "button",
      {
        type: "button",
        class: "blind-roll-action-btn",
      },
      h("i", { class: "fa-solid fa-dice-d20", "aria-hidden": "true" }),
      " Rolar Teste Misterioso",
    );

    const row = h(
      "div",
      { class: "blind-actor-row" },
      h("div", { class: "blind-actor-card" }, portrait, name),
      rollBtn,
    );

    rollBtn.addEventListener("click", () => {
      rollBtn.disabled = true;
      submitPlayerBlindRoll(broadcast.checkId, actor.id);

      const confirmed = h(
        "div",
        { class: "blind-roll-success" },
        h("i", { class: "fa-solid fa-circle-check", "aria-hidden": "true" }),
        " Rolagem enviada!",
      );
      rollBtn.replaceWith(confirmed);
      remaining -= 1;

      if (remaining <= 0) {
        setTimeout(() => {
          void dialog?.close();
        }, 2500);
      }
    });

    actorList.append(row);
  }

  content.append(actorList);

  dialog = new DialogV2({
    window: {
      title: "🎲 Teste Misterioso às Cegas",
      icon: "fa-solid fa-eye-slash",
    },
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "close",
        label: "Fechar",
        icon: "fa-solid fa-xmark",
      },
    ],
  });

  void dialog.render({ force: true });
}
