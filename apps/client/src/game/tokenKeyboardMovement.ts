import { findOwnCharacter } from "../ui/actors/ownCharacter";

/** Holding a key keeps walking, one square per step, without flooding the server. */
const MIN_STEP_INTERVAL_MS = 140;
const VIEW_EDGE_MARGIN_RATIO = 0.15;

const DIRECTIONS = [
  { action: "moveTokenUp", name: "Mover token para cima", key: "KeyW", columns: 0, rows: -1 },
  { action: "moveTokenLeft", name: "Mover token para a esquerda", key: "KeyA", columns: -1, rows: 0 },
  { action: "moveTokenDown", name: "Mover token para baixo", key: "KeyS", columns: 0, rows: 1 },
  { action: "moveTokenRight", name: "Mover token para a direita", key: "KeyD", columns: 1, rows: 0 },
] as const;

let stepInFlight = false;
let lastStepAt = 0;

/** The GM's puppet first, then selected tokens; a player with nothing selected walks their own character. */
function tokensToMove(): any[] {
  const puppet = canvas.tokens?.puppet;
  if (puppet) return [puppet];
  const controlled: any[] = canvas.tokens?.controlled ?? [];
  if (controlled.length > 0 || game.user.isGM) return controlled;
  const characterId = findOwnCharacter(game.user)?.id;
  const own = (canvas.tokens?.placeables ?? []).find((token: any) => characterId && token.document.actorId === characterId && token.isOwner);
  return own ? [own] : [];
}

/** Pans only when the token walks close to the edge of the screen, so the camera does not jump on every step. */
function keepInView(token: any): void {
  const screen = canvas.clientCoordinatesFromCanvas(token.center);
  const marginX = window.innerWidth * VIEW_EDGE_MARGIN_RATIO;
  const marginY = window.innerHeight * VIEW_EDGE_MARGIN_RATIO;
  const nearEdge = screen.x < marginX || screen.x > window.innerWidth - marginX || screen.y < marginY || screen.y > window.innerHeight - marginY;
  if (nearEdge) void canvas.animatePan({ x: token.center.x, y: token.center.y });
}

async function step(columns: number, rows: number): Promise<boolean> {
  if (!canvas.ready || canvas.activeLayer?.name !== "tokens") return false;
  const tokens = tokensToMove();
  if (tokens.length === 0) return false;
  const now = Date.now();
  if (stepInFlight || now - lastStepAt < MIN_STEP_INTERVAL_MS) return true;
  stepInFlight = true;
  lastStepAt = now;
  try {
    if (!tokens[0].controlled) tokens[0].control({ releaseOthers: true });
    await canvas.interaction.stepTokens(tokens, columns, rows);
    keepInView(tokens[0]);
  } finally {
    stepInFlight = false;
  }
  return true;
}

/** W, A, S and D walk the selected token one square at a time (rebindable in Configurações > Atalhos). */
export function registerTokenKeyboardMovement(): void {
  for (const direction of DIRECTIONS) {
    game.keybindings.register("core", direction.action, {
      name: direction.name,
      hint: "Anda um quadrado por vez com o token selecionado. Segure para continuar andando. Paredes, mapa travado e pausa continuam valendo.",
      editable: [{ key: direction.key }],
      onDown: () => {
        void step(direction.columns, direction.rows);
        return tokensToMove().length > 0;
      },
    });
  }
}
