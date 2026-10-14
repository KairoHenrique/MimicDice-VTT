export const TOKEN_GROUP_FLAG = "tokenGroup";
const GROUP_ID_PATTERN = /^[A-Za-z0-9]{1,32}$/;

export interface GroupedToken {
  id: string;
  x: number;
  y: number;
  group: string | null;
}

export interface Point {
  x: number;
  y: number;
}

export function readTokenGroup(value: unknown): string | null {
  return typeof value === "string" && GROUP_ID_PATTERN.test(value) ? value : null;
}

/** Where the other members of the moved token's group go: the same shift, so the formation keeps its spacing. */
export function followerDestinations(moved: GroupedToken, delta: Point, tokens: readonly GroupedToken[]): Array<{ _id: string; x: number; y: number }> {
  if (!moved.group || (delta.x === 0 && delta.y === 0)) return [];
  return tokens
    .filter((token) => token.id !== moved.id && token.group === moved.group)
    .map((token) => ({ _id: token.id, x: Math.round(token.x + delta.x), y: Math.round(token.y + delta.y) }));
}
