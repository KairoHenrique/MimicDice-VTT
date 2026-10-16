const ROLL_MODE_PREFIXES: Readonly<Record<string, string>> = Object.freeze({
  "/r": "",
  "/roll": "",
  "/pr": "publicroll",
  "/publicroll": "publicroll",
  "/gmr": "gmroll",
  "/gmroll": "gmroll",
  "/br": "blindroll",
  "/broll": "blindroll",
  "/blindroll": "blindroll",
  "/sr": "selfroll",
  "/selfroll": "selfroll",
});

export interface RollCommand {
  formula: string;
  rollMode: string | null;
  flavor: string;
}

/** Accepts a bare formula ("2d6+3") or a Foundry-style roll command ("/gmr 1d20 # Furtividade"). */
export function parseRollCommand(input: string): RollCommand | null {
  let text = input.trim();
  if (!text) return null;
  let rollMode: string | null = null;
  const prefix = /^\/[a-z]+/i.exec(text)?.[0]?.toLowerCase();
  if (prefix) {
    if (!Object.hasOwn(ROLL_MODE_PREFIXES, prefix)) return null;
    rollMode = ROLL_MODE_PREFIXES[prefix] || null;
    text = text.slice(prefix.length).trim();
  }
  const [formulaPart, ...flavorParts] = text.split("#");
  const formula = formulaPart.trim();
  if (!formula) return null;
  return { formula, rollMode, flavor: flavorParts.join("#").trim() };
}

function appendTerms(poolFormula: string, extra: string): string {
  const trimmed = extra.trim();
  if (!trimmed) return poolFormula;
  return /^[+\-*/]/.test(trimmed) ? `${poolFormula} ${trimmed}` : `${poolFormula} + ${trimmed}`;
}

/** Merges queued dice with whatever the user typed: "/gmr 5 # Ataque" + "2d6" becomes "/gmr 2d6 + 5 # Ataque". */
export function combinePoolWithInput(poolFormula: string, input: string): string {
  const text = input.trim();
  if (!poolFormula) return text;
  const prefixMatch = /^(\/[a-z]+)\s*/i.exec(text);
  const prefix = prefixMatch ? `${prefixMatch[1]} ` : "";
  const [formulaPart = "", ...flavorParts] = text.slice(prefixMatch?.[0].length ?? 0).split("#");
  const flavor = flavorParts.join("#").trim();
  return `${prefix}${appendTerms(poolFormula, formulaPart)}${flavor ? ` # ${flavor}` : ""}`;
}

interface SpeakerRollOptions {
  actor?: any;
  flavor?: string;
  rollMode?: string | null;
  extraRollData?: Record<string, unknown>;
}

export async function rollAsSpeaker(formula: string, { actor = null, flavor = "", rollMode, extraRollData = {} }: SpeakerRollOptions = {}): Promise<unknown> {
  // Sheet extras last so @atalhos from the board win over empty/partial actor.system paths.
  const rollData = { ...(actor?.getRollData?.() ?? {}), ...extraRollData };
  const roll = Roll.create(formula, rollData);
  await roll.evaluate();
  const speaker = ChatMessage.getSpeaker({ actor: actor ?? undefined });
  return roll.toMessage({ speaker, flavor }, { rollMode: rollMode ?? undefined });
}
