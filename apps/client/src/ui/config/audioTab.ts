import { h } from "../../views/dom";
import { readVolume, testSound, type SoundCategory } from "../../game/audio/soundEffects";

interface AudioRowDef {
  key: string;
  category: SoundCategory;
  icon: string;
  label: string;
  hint: string;
  defaultVal: number;
}

const AUDIO_ROWS: readonly AudioRowDef[] = [
  {
    key: "volumeMaster",
    category: "master",
    icon: "fa-solid fa-sliders",
    label: "Volume Geral",
    hint: "Controla o volume principal de todos os sons do aplicativo.",
    defaultVal: 100,
  },
  {
    key: "volumeDice",
    category: "dice",
    icon: "fa-solid fa-dice-d20",
    label: "Som dos Dados",
    hint: "Barulho dos dados rolando na mesa ou no chat.",
    defaultVal: 80,
  },
  {
    key: "volumeFootsteps",
    category: "footsteps",
    icon: "fa-solid fa-shoe-prints",
    label: "Som de Andar",
    hint: "Passos ao movimentar o personagem pelo teclado com WASD.",
    defaultVal: 50,
  },
  {
    key: "volumeAlerts",
    category: "alerts",
    icon: "fa-solid fa-bell",
    label: "Som de Alertas e Pings",
    hint: "Avisos quando o mestre destaca campos da ficha, mensagens e notificações.",
    defaultVal: 80,
  },
];

export function buildAudioTab(): HTMLElement {
  const container = h("div", { class: "config-tab-panel audio-config-panel" });

  const header = h(
    "div",
    { class: "audio-config-header" },
    h("h3", {}, h("i", { class: "fa-solid fa-volume-high", "aria-hidden": "true" }), " Configurações de Áudio"),
    h("p", { class: "hint" }, "Ajuste o volume individual de cada tipo de efeito sonoro ou silencie o que preferir."),
  );

  const list = h("div", { class: "audio-controls-list" });

  for (const def of AUDIO_ROWS) {
    let current = readVolume(def.category);
    let lastNonZero = current > 0 ? current : def.defaultVal;

    const valueDisplay = h("span", { class: "audio-val" }, `${current}%`);
    const slider = h("input", {
      type: "range",
      min: "0",
      max: "100",
      step: "5",
      value: String(current),
      "aria-label": def.label,
      class: "audio-slider",
    }) as HTMLInputElement;

    const muteBtn = h(
      "button",
      {
        type: "button",
        class: "icon-button audio-mute-btn",
        title: current === 0 ? "Ativar som" : "Silenciar",
        "aria-label": current === 0 ? "Ativar som" : "Silenciar",
      },
      h("i", { class: current === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high", "aria-hidden": "true" }),
    );

    const testBtn = h(
      "button",
      {
        type: "button",
        class: "audio-test-btn",
        title: `Testar ${def.label}`,
      },
      h("i", { class: "fa-solid fa-play", "aria-hidden": "true" }),
      " Testar",
    );

    const updateValue = (next: number) => {
      current = Math.max(0, Math.min(100, Math.round(next)));
      if (current > 0) lastNonZero = current;
      slider.value = String(current);
      valueDisplay.textContent = `${current}%`;
      muteBtn.title = current === 0 ? "Ativar som" : "Silenciar";
      const icon = muteBtn.querySelector("i");
      if (icon) icon.className = current === 0 ? "fa-solid fa-volume-xmark" : "fa-solid fa-volume-high";
      void game.settings.set("core", def.key, current);
    };

    slider.addEventListener("input", () => {
      valueDisplay.textContent = `${slider.value}%`;
    });

    slider.addEventListener("change", () => {
      updateValue(Number(slider.value));
    });

    muteBtn.addEventListener("click", () => {
      if (current === 0) {
        updateValue(lastNonZero);
      } else {
        lastNonZero = current;
        updateValue(0);
      }
    });

    testBtn.addEventListener("click", () => {
      testSound(def.category);
    });

    const row = h(
      "div",
      { class: "audio-control-row" },
      h(
        "div",
        { class: "audio-row-info" },
        h("div", { class: "audio-row-title" }, h("i", { class: def.icon, "aria-hidden": "true" }), ` ${def.label}`),
        h("div", { class: "audio-row-hint" }, def.hint),
      ),
      h("div", { class: "audio-row-inputs" }, muteBtn, slider, valueDisplay, testBtn),
    );

    list.append(row);
  }

  container.append(header, list);
  return container;
}
