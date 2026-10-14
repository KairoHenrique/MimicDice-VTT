import type { ClientSettings } from "@tabbletop/api";
import { MAX_PLAYER_VISION_LIMIT, PLAYER_VISION_LIMIT_SETTING_KEY } from "@tabbletop/protocol";
import { h } from "../views/dom";

const [VISION_NAMESPACE, VISION_KEY] = PLAYER_VISION_LIMIT_SETTING_KEY.split(".") as [string, string];

export function registerPlayerVisionSetting(settings: ClientSettings): void {
  settings.register(VISION_NAMESPACE, VISION_KEY, {
    name: "Alcance da visão dos jogadores",
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => {
      canvas?.visibility?.update?.();
      void ui.hostToolbar?.render();
    },
  });
}

/** Distance in scene units (meters by default); 0 means players see as far as walls and light allow. */
export function playerVisionLimit(): number {
  const limit = Number(game.settings.get(VISION_NAMESPACE, VISION_KEY));
  return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

function sceneUnits(): string {
  return canvas?.dimensions?.units || "m";
}

export function playerVisionLabel(): string {
  const limit = playerVisionLimit();
  return limit > 0 ? `Visão: ${String(limit).replace(".", ",")} ${sceneUnits()}` : "Visão: livre";
}

function parseLimit(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > MAX_PLAYER_VISION_LIMIT) return null;
  return Math.round(value * 10) / 10;
}

/** GM-only: asks how far players may see around their tokens. */
export async function configurePlayerVision(): Promise<void> {
  if (!game.user.isGM) return;
  const current = playerVisionLimit();
  const input = h("input", { type: "number", name: "visionLimit", min: 0, max: MAX_PLAYER_VISION_LIMIT, step: "0.5", inputmode: "decimal", value: current > 0 ? String(current) : "", placeholder: "Sem limite", "aria-describedby": "player-vision-hint" });
  const content = h(
    "div",
    { class: "player-vision-form" },
    h("label", {}, `Até quantos ${sceneUnits()} os jogadores enxergam?`, input),
    h("p", { id: "player-vision-hint", class: "hint" }, "Vale para todos os jogadores em todas as cenas, a partir do token de cada um. Paredes continuam bloqueando a visão. Deixe vazio ou 0 para não limitar. O mestre sempre vê tudo."),
  );
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Visão dos jogadores" },
    content,
    ok: { label: "Salvar", icon: "fa-solid fa-check", callback: () => input.value },
    rejectClose: false,
  });
  if (typeof answer !== "string") return;
  const limit = parseLimit(answer);
  if (limit === null) {
    ui.notifications.warn(`Digite um número entre 0 e ${MAX_PLAYER_VISION_LIMIT}.`);
    return;
  }
  await game.settings.set(VISION_NAMESPACE, VISION_KEY, limit);
  ui.notifications.info(limit > 0 ? `Os jogadores agora enxergam até ${String(limit).replace(".", ",")} ${sceneUnits()}.` : "A visão dos jogadores não tem mais limite.");
}
