export interface WhisperUser {
  id: string;
  name: string;
  isGM: boolean;
}

export type WhisperParseResult = { recipientIds: string[]; text: string } | { error: string };

const WHISPER_PREFIX = /^\/(?:w|whisper)(?:\s+|$)/i;
const GROUP_ALIASES: Readonly<Record<string, (user: WhisperUser) => boolean>> = {
  gm: (user) => user.isGM,
  mestre: (user) => user.isGM,
  players: (user) => !user.isGM,
  jogadores: (user) => !user.isGM,
};

export function isWhisperCommand(input: string): boolean {
  return WHISPER_PREFIX.test(input.trim());
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function usersForTarget(target: string, users: readonly WhisperUser[]): WhisperUser[] {
  const key = normalize(target);
  const group = GROUP_ALIASES[key];
  if (group) return users.filter(group);
  return users.filter((user) => normalize(user.name) === key);
}

/** Splits `rest` into the target and the message when the target is written without quotes or brackets. */
function splitUnquotedTarget(rest: string, users: readonly WhisperUser[]): { target: string; text: string } {
  const lowered = normalize(rest);
  const candidates = [...users.map((user) => user.name), ...Object.keys(GROUP_ALIASES)].sort((left, right) => right.length - left.length);
  const match = candidates.find((name) => {
    const key = normalize(name);
    return lowered.startsWith(key) && (lowered.length === key.length || /\s/.test(lowered[key.length]));
  });
  if (match) return { target: rest.slice(0, match.length), text: rest.slice(match.length).trim() };
  const [first = "", ...others] = rest.split(/\s+/);
  return { target: first, text: others.join(" ") };
}

function splitTargets(rest: string, users: readonly WhisperUser[]): { targets: string[]; text: string } {
  const bracketed = /^\[([^\]]*)\]\s*/.exec(rest);
  if (bracketed) return { targets: bracketed[1].split(","), text: rest.slice(bracketed[0].length).trim() };
  const quoted = /^"([^"]+)"\s*/.exec(rest);
  if (quoted) return { targets: [quoted[1]], text: rest.slice(quoted[0].length).trim() };
  const { target, text } = splitUnquotedTarget(rest, users);
  return { targets: [target], text };
}

/** Parses `/w Nome mensagem`, `/w "Nome com espaço" mensagem`, `/w [Ana, Bruno] mensagem` or `/w mestre mensagem`. */
export function parseWhisperCommand(input: string, users: readonly WhisperUser[], selfId: string): WhisperParseResult {
  const rest = input.trim().replace(WHISPER_PREFIX, "").trim();
  if (!rest) return { error: "Use /w Nome mensagem." };
  const { targets, text } = splitTargets(rest, users);
  if (!text) return { error: "Escreva a mensagem depois do nome." };
  const recipientIds = new Set<string>();
  for (const target of targets.map((entry) => entry.trim()).filter(Boolean)) {
    const found = usersForTarget(target, users).filter((user) => user.id !== selfId);
    if (found.length === 0) return { error: `Ninguém chamado "${target}" para receber a mensagem.` };
    for (const user of found) recipientIds.add(user.id);
  }
  if (recipientIds.size === 0) return { error: "Escolha pelo menos uma pessoa." };
  return { recipientIds: [...recipientIds], text };
}
