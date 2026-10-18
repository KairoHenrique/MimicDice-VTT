import { DialogV2 } from "@tabbletop/api";
import { h } from "../../views/dom";
import { playerCharacters } from "../concealment/perception";
import { collectAvailableSkills, startGroupBlindCheck } from "./blindCheckManager";

const ATTRIBUTE_CHOICES = [
  { key: "auto", label: "Automático (melhor atributo do personagem)" },
  { key: "agilidade", label: "Agilidade" },
  { key: "forca", label: "Força" },
  { key: "intelecto", label: "Intelecto" },
  { key: "presenca", label: "Presença" },
  { key: "vigor", label: "Vigor" },
] as const;

export function openBlindCheckDialog(): void {
  const skills = collectAvailableSkills();
  const characters = playerCharacters();

  if (characters.length === 0) {
    ui.notifications.warn("Nenhum personagem de jogador encontrado na mesa.");
    return;
  }

  const form = h("div", { class: "blind-check-form" });

  // Skill selector
  const skillSelect = h("select", { name: "skillLabel", class: "blind-select-skill" });
  for (const skill of skills) {
    skillSelect.append(h("option", { value: skill, selected: skill === "Percepção" }, skill));
  }

  // Attribute selector
  const attrSelect = h("select", { name: "attributeKey", class: "blind-select-attr" });
  for (const attr of ATTRIBUTE_CHOICES) {
    attrSelect.append(h("option", { value: attr.key }, attr.label));
  }

  // Difficulty DC
  const dcInput = h("input", {
    type: "number",
    name: "dc",
    min: "0",
    max: "100",
    step: "1",
    placeholder: "Ex.: 15 (opcional)",
    class: "blind-dc-input",
  }) as HTMLInputElement;

  // Custom hint/message
  const messageInput = h("input", {
    type: "text",
    name: "message",
    maxLength: 120,
    placeholder: "Ex.: Vocês ouvem um barulho estranho no corredor...",
    class: "blind-message-input",
  }) as HTMLInputElement;

  // Character checkboxes
  const actorCheckboxes = new Map<string, HTMLInputElement>();
  const charList = h("div", { class: "blind-char-select-list" });

  for (const actor of characters) {
    const isOnline = game.users?.contents.some((u: any) => u.active && u.character?.id === actor.id);
    const checkbox = h("input", {
      type: "checkbox",
      name: `actor-${actor.id}`,
      checked: true,
      class: "blind-char-check",
    }) as HTMLInputElement;
    actorCheckboxes.set(actor.id, checkbox);

    const onlineBadge = isOnline ? h("span", { class: "badge-online", title: "Jogador conectado" }, "Online") : null;
    const label = h(
      "label",
      { class: "blind-char-label" },
      checkbox,
      h("img", { class: "blind-actor-thumb", src: actor.img ?? "/icons/svg/mystery-man.svg", alt: "" }),
      h("span", { class: "blind-char-name" }, actor.name),
      onlineBadge,
    );
    charList.append(label);
  }

  form.append(
    h("div", { class: "blind-form-field" }, h("label", { class: "field-title" }, "Perícia a testar"), skillSelect),
    h("div", { class: "blind-form-field" }, h("label", { class: "field-title" }, "Atributo associado"), attrSelect),
    h(
      "div",
      { class: "blind-form-field" },
      h("label", { class: "field-title" }, "Dificuldade (DT opcional)"),
      h("p", { class: "hint" }, "Se preenchido, o painel do mestre indicará quem passou ou falhou."),
      dcInput,
    ),
    h(
      "div",
      { class: "blind-form-field" },
      h("label", { class: "field-title" }, "Mensagem / Apelo para os jogadores (opcional)"),
      messageInput,
    ),
    h(
      "div",
      { class: "blind-form-field" },
      h("label", { class: "field-title" }, "Personagens chamados para rolar"),
      charList,
    ),
  );

  const dialog = new DialogV2({
    window: {
      title: "🎲 Pedir Teste às Cegas para o Grupo",
      icon: "fa-solid fa-eye-slash",
    },
    position: { width: 480 },
    content: form,
    buttons: [
      {
        action: "submit",
        label: "Pedir Rolagem às Cegas",
        icon: "fa-solid fa-paper-plane",
        default: true,
        callback: () => {
          const selectedActorIds = Array.from(actorCheckboxes.entries())
            .filter(([, cb]) => cb.checked)
            .map(([actorId]) => actorId);

          if (selectedActorIds.length === 0) {
            ui.notifications.warn("Selecione pelo menos um personagem para o teste.");
            return;
          }

          const skillLabel = skillSelect.value;
          const chosenAttrKey = attrSelect.value;
          const attributeKey = chosenAttrKey === "auto" ? null : chosenAttrKey;
          const chosenAttr = ATTRIBUTE_CHOICES.find((c) => c.key === chosenAttrKey);
          const attributeLabel = chosenAttrKey === "auto" ? null : (chosenAttr?.label ?? null);

          const dcNum = Number(dcInput.value);
          const dc = Number.isFinite(dcNum) && dcNum > 0 ? dcNum : null;
          const message = messageInput.value.trim() || undefined;

          const checkId = foundry.utils.randomID();

          startGroupBlindCheck({
            checkId,
            skillLabel,
            attributeKey,
            attributeLabel,
            dc,
            message,
            targetActorIds: selectedActorIds,
          });
        },
      },
      {
        action: "cancel",
        label: "Cancelar",
        icon: "fa-solid fa-xmark",
      },
    ],
  });

  void dialog.render({ force: true });
}
