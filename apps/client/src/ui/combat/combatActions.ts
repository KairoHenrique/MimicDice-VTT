/** GM-side helpers for running an encounter; the tracker UI only wires buttons to these. */

export function viewedCombat(): any | null {
  return game.combats?.viewed ?? null;
}

function selectedTokens(): any[] {
  return canvas.ready ? (canvas.tokens?.controlled ?? []) : [];
}

async function ensureCombat(): Promise<any | null> {
  const existing = viewedCombat();
  if (existing) return existing;
  if (!canvas.scene) {
    ui.notifications.warn("Abra uma cena antes de começar um combate.");
    return null;
  }
  return CONFIG.Combat.documentClass.create({ scene: canvas.scene.id, active: true, round: 0, turn: null, started: false });
}

/** Adds the given tokens (or the selected ones) to the viewed encounter, creating it when needed and skipping duplicates. */
export async function addTokensToCombat(tokens: any[] = selectedTokens()): Promise<void> {
  if (tokens.length === 0) {
    ui.notifications.warn("Selecione tokens no mapa para colocar no combate.");
    return;
  }
  const combat = await ensureCombat();
  if (!combat) return;
  const present = new Set(combat.combatants.map((combatant: any) => combatant.tokenId));
  const firstSort = combat.hasManualOrder ? combat.nextManualSort : 0;
  const additions = tokens
    .filter((token) => !present.has(token.id))
    .map((token, index) => ({
      sort: combat.hasManualOrder ? firstSort + index * 10 : 0,
      tokenId: token.id,
      sceneId: token.document.parent?.id ?? canvas.scene?.id ?? null,
      actorId: token.document.actorId ?? null,
      name: String(token.document.name ?? token.actor?.name ?? "Token"),
      img: token.document.texture?.src ?? token.actor?.img ?? null,
      hidden: token.document.hidden === true,
    }));
  if (additions.length === 0) {
    ui.notifications.info("Esses tokens já estão no combate.");
    return;
  }
  await combat.createEmbeddedDocuments("Combatant", additions);
}

export async function removeTokensFromCombat(tokens: any[]): Promise<void> {
  const combat = viewedCombat();
  if (!combat) return;
  const tokenIds = new Set(tokens.map((token) => token.id));
  const ids = combat.combatants.filter((combatant: any) => tokenIds.has(combatant.tokenId)).map((combatant: any) => combatant.id);
  if (ids.length > 0) await combat.deleteEmbeddedDocuments("Combatant", ids);
}

export function isTokenInCombat(token: any): boolean {
  return Boolean(viewedCombat()?.combatants.some((combatant: any) => combatant.tokenId === token.id));
}

export async function confirmEndCombat(combat: any): Promise<void> {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Encerrar combate" },
    content: "<p>Encerrar o combate e apagar a ordem de iniciativa?</p>",
  });
  if (confirmed) await combat.endCombat();
}

/** Centers the camera on a combatant's token when the user can see it. */
export function panToCombatant(combatant: any): void {
  const token = canvas.tokens?.get?.(combatant.tokenId);
  if (!token || !token.visible) return;
  void canvas.animatePan({ x: token.center.x, y: token.center.y });
}
