import { Hooks, segmentsCross } from "@tabbletop/api";
import { findOwnCharacter } from "../ui/actors/ownCharacter";
import { isScenePaused } from "./scenePause";
import { isMapLocked } from "./tableControls";

const VIEW_EDGE_MARGIN_RATIO = 0.15;
const WALK_SPEED_SQUARES_PER_SEC = 4.5;
const MIN_TAP_STEP_RATIO = 0.2;

const DIRECTIONS = [
  { action: "moveTokenUp", name: "Mover token para cima", key: "KeyW", vx: 0, vy: -1 },
  { action: "moveTokenLeft", name: "Mover token para a esquerda", key: "KeyA", vx: -1, vy: 0 },
  { action: "moveTokenDown", name: "Mover token para baixo", key: "KeyS", vx: 0, vy: 1 },
  { action: "moveTokenRight", name: "Mover token para a direita", key: "KeyD", vx: 1, vy: 0 },
] as const;

const activeActions = new Set<string>();
let walkRafId: number | null = null;
let lastFrameTime = 0;
let walkingTokens: any[] = [];
let hasMovedInSession = false;

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

function isBlockedByWall(token: any, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  if (game.user.isGM) return false;
  const halfW = token.w / 2;
  const halfH = token.h / 2;
  const centerFrom = { x: from.x + halfW, y: from.y + halfH };
  const centerTo = { x: to.x + halfW, y: to.y + halfH };
  const walls = (canvas.walls?.placeables ?? []) as any[];
  return walls.some((wall) => wall.blocks?.("move") && segmentsCross(centerFrom, centerTo, wall.segment));
}

function announceDrag(tokens: any[], ended: boolean): void {
  const previewData = tokens.map((t) => ({ tokenId: t.id, x: Math.round(t.position.x), y: Math.round(t.position.y) }));
  Hooks.callAll("dragTokenPreview", previewData, ended);
}

async function commitMovement(tokens: any[]): Promise<void> {
  if (!canvas.scene || tokens.length === 0) return;
  const updates = tokens.map((token) => ({
    _id: token.id,
    x: Math.round(token.position.x),
    y: Math.round(token.position.y),
  }));
  try {
    await canvas.scene.updateEmbeddedDocuments("Token", updates);
  } catch {
    for (const token of tokens) if (!token.destroyed) token.refresh();
  }
}

function walkStep(timestamp: number): void {
  if (activeActions.size === 0 || walkingTokens.length === 0 || !canvas.ready) {
    void finishWalking();
    return;
  }
  const dt = lastFrameTime > 0 ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0.016;
  lastFrameTime = timestamp;

  let dirX = 0;
  let dirY = 0;
  for (const dir of DIRECTIONS) {
    if (activeActions.has(dir.action)) {
      dirX += dir.vx;
      dirY += dir.vy;
    }
  }

  const length = Math.hypot(dirX, dirY);
  if (length > 0) {
    const normX = dirX / length;
    const normY = dirY / length;
    const gridSize = canvas.grid?.size || 100;
    const speed = gridSize * WALK_SPEED_SQUARES_PER_SEC;
    const stepDist = speed * dt;
    const moveX = normX * stepDist;
    const moveY = normY * stepDist;

    for (const token of walkingTokens) {
      if (token.destroyed) continue;
      const current = { x: token.position.x, y: token.position.y };
      const targetBoth = { x: current.x + moveX, y: current.y + moveY };

      let nextX = current.x;
      let nextY = current.y;

      if (!isBlockedByWall(token, current, targetBoth)) {
        nextX = targetBoth.x;
        nextY = targetBoth.y;
      } else {
        // Try sliding along X or Y
        const targetX = { x: current.x + moveX, y: current.y };
        const targetY = { x: current.x, y: current.y + moveY };
        if (moveX !== 0 && !isBlockedByWall(token, current, targetX)) {
          nextX = targetX.x;
        } else if (moveY !== 0 && !isBlockedByWall(token, current, targetY)) {
          nextY = targetY.y;
        }
      }

      if (nextX !== current.x || nextY !== current.y) {
        token.position.set(nextX, nextY);
        token.document.x = nextX;
        token.document.y = nextY;
        token.refresh();
        hasMovedInSession = true;
      }
    }

    if (walkingTokens[0]) keepInView(walkingTokens[0]);
    announceDrag(walkingTokens, false);
  }

  walkRafId = requestAnimationFrame(walkStep);
}

function startWalking(): void {
  if (walkRafId !== null) return;
  if (!canvas.ready || canvas.activeLayer?.name !== "tokens") return;
  if (!game.user.isGM && (isScenePaused() || isMapLocked())) return;

  const tokens = tokensToMove();
  if (tokens.length === 0) return;

  walkingTokens = tokens.filter((t) => t.canDrag?.() || t.isOwner || game.user.isGM);
  if (walkingTokens.length === 0) return;

  if (!walkingTokens[0].controlled) walkingTokens[0].control({ releaseOthers: true });
  hasMovedInSession = false;
  lastFrameTime = performance.now();
  walkRafId = requestAnimationFrame(walkStep);
}

let lastTapAction: string | null = null;

function handleDirectionDown(action: string): boolean {
  if (!canvas.ready || canvas.activeLayer?.name !== "tokens") return false;
  if (!game.user.isGM && (isScenePaused() || isMapLocked())) return false;
  activeActions.add(action);
  lastTapAction = action;
  startWalking();
  return true;
}

function handleDirectionUp(action: string): boolean {
  activeActions.delete(action);
  if (activeActions.size === 0) {
    void finishWalking();
  }
  return true;
}

async function finishWalking(): Promise<void> {
  if (walkRafId !== null) {
    cancelAnimationFrame(walkRafId);
    walkRafId = null;
  }
  lastFrameTime = 0;
  const tokens = walkingTokens;
  walkingTokens = [];

  if (tokens.length === 0) return;

  // If released before moving in frame (e.g. instant key tap), perform a small clean step
  if (!hasMovedInSession && lastTapAction) {
    const dir = DIRECTIONS.find((d) => d.action === lastTapAction);
    if (dir) {
      const gridSize = canvas.grid?.size || 100;
      const stepDist = gridSize * MIN_TAP_STEP_RATIO;
      for (const token of tokens) {
        const current = { x: token.position.x, y: token.position.y };
        const target = { x: current.x + dir.vx * stepDist, y: current.y + dir.vy * stepDist };
        if (!isBlockedByWall(token, current, target)) {
          token.position.set(target.x, target.y);
          token.document.x = target.x;
          token.document.y = target.y;
          token.refresh();
        }
      }
    }
  }
  lastTapAction = null;

  announceDrag(tokens, true);
  await commitMovement(tokens);
}

/** W, A, S and D walk the selected token smoothly across the map without block jumping. */
export function registerTokenKeyboardMovement(): void {
  window.addEventListener("blur", () => {
    activeActions.clear();
    void finishWalking();
  });

  for (const direction of DIRECTIONS) {
    game.keybindings.register("core", direction.action, {
      name: direction.name,
      hint: "Anda com o token selecionado suavemente pelo mapa. Segure para continuar andando. Paredes, mapa travado e pausa continuam valendo.",
      editable: [{ key: direction.key }],
      onDown: () => handleDirectionDown(direction.action),
      onUp: () => handleDirectionUp(direction.action),
    });
  }
}
