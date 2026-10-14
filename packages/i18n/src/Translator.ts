/** Source (Portuguese) text to translated text; `{0}`, `{1}`... mark the parts that change at runtime. */
export type Catalog = Readonly<Record<string, string>>;

interface CompiledPattern {
  regex: RegExp;
  /** Placeholder number of each capture group, in the order they appear in the source. */
  slots: number[];
  target: string;
  literalLength: number;
  /** Little fixed text ("{0} de {1}"): it would match pieces of unrelated sentences, so captures must be short names or numbers. */
  loose: boolean;
}

const PLACEHOLDER = /\{(\d+)\}/g;
const WORD = /\p{L}{2,}/gu;
const SEPARATORS = [", ", " · ", "; "];
const MAX_CACHE_ENTRIES = 4000;
const MAX_CAPTURE_DEPTH = 2;
/** Interface strings are short; longer text (chat, journals) skips the patterns, whose lazy groups would backtrack. */
const MAX_PATTERN_TEXT_LENGTH = 600;
const LOOSE_PATTERN_MAX_LETTERS = 7;
const LOOSE_CAPTURE_MAX_WORDS = 4;
const SENTENCE_PUNCTUATION = /[:!?;]|\.(\s|$)/;

function isShortCapture(captured: string): boolean {
  return !SENTENCE_PUNCTUATION.test(captured) && captured.trim().split(/\s+/).length <= LOOSE_CAPTURE_MAX_WORDS;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compilePattern(source: string, target: string): CompiledPattern {
  const slots: number[] = [];
  let literalLength = 0;
  let expression = "";
  let lastIndex = 0;
  for (const match of source.matchAll(PLACEHOLDER)) {
    const literal = source.slice(lastIndex, match.index);
    literalLength += literal.length;
    expression += `${escapeRegExp(literal)}(.+?)`;
    slots.push(Number(match[1]));
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  const tail = source.slice(lastIndex);
  literalLength += tail.length;
  expression += escapeRegExp(tail);
  const letters = source.replace(PLACEHOLDER, "").match(/\p{L}/gu)?.length ?? 0;
  return { regex: new RegExp(`^${expression}$`, "su"), slots, target, literalLength, loose: letters <= LOOSE_PATTERN_MAX_LETTERS };
}

/** The most selective word of a pattern: the longest literal word, so lookups only test a handful of patterns. */
function indexWord(source: string): string | null {
  const literals = source.replace(PLACEHOLDER, " ").match(WORD) ?? [];
  return literals.reduce<string | null>((best, word) => (best === null || word.length > best.length ? word : best), null);
}

/**
 * Translates whole interface strings: exact matches first, then `{n}` patterns whose captured values are translated
 * too (so "Turno 3" or "Aplicar efeito em Ana" work), then lists joined by commas when every item is known.
 */
export class Translator {
  readonly #exact = new Map<string, string>();
  readonly #patternsByWord = new Map<string, CompiledPattern[]>();
  readonly #wordlessPatterns: CompiledPattern[] = [];
  readonly #cache = new Map<string, string | null>();

  constructor(catalog: Catalog) {
    for (const [source, target] of Object.entries(catalog)) {
      if (typeof target !== "string" || !target) continue;
      if (!/\{\d+\}/.test(source)) {
        if (target !== source) this.#exact.set(normalizeText(source), target);
        continue;
      }
      if (!source.replace(PLACEHOLDER, "").trim()) continue;
      const pattern = compilePattern(normalizeText(source), target);
      const word = indexWord(source);
      if (word === null) this.#wordlessPatterns.push(pattern);
      else this.#patternsByWord.set(word, [...(this.#patternsByWord.get(word) ?? []), pattern]);
    }
    for (const bucket of this.#patternsByWord.values()) bucket.sort((left, right) => right.literalLength - left.literalLength);
  }

  get size(): number {
    return this.#exact.size + this.#wordlessPatterns.length + [...this.#patternsByWord.values()].reduce((total, bucket) => total + bucket.length, 0);
  }

  /** The translation of `text`, or null when the catalog does not know it. Whitespace inside is normalized. */
  translate(text: string): string | null {
    const normalized = normalizeText(text);
    if (!normalized || !/\p{L}/u.test(normalized)) return null;
    const cached = this.#cache.get(normalized);
    if (cached !== undefined) return cached;
    const translated = this.#translateNormalized(normalized, 0) ?? this.#translateList(normalized);
    const result = translated === normalized ? null : translated;
    if (this.#cache.size >= MAX_CACHE_ENTRIES) this.#cache.clear();
    this.#cache.set(normalized, result);
    return result;
  }

  /** Translation when known, the original text otherwise. */
  t(text: string): string {
    return this.translate(text) ?? text;
  }

  #translateNormalized(text: string, depth: number): string | null {
    const exact = this.#exact.get(text);
    if (exact !== undefined) return exact;
    if (depth > MAX_CAPTURE_DEPTH || text.length > MAX_PATTERN_TEXT_LENGTH) return null;
    return this.#translatePattern(text, depth);
  }

  #candidatePatterns(text: string): CompiledPattern[] {
    const words = new Set(text.match(WORD) ?? []);
    const candidates: CompiledPattern[] = [];
    for (const word of words) {
      const bucket = this.#patternsByWord.get(word);
      if (bucket) candidates.push(...bucket);
    }
    candidates.sort((left, right) => right.literalLength - left.literalLength);
    return [...candidates, ...this.#wordlessPatterns];
  }

  #translatePattern(text: string, depth: number): string | null {
    for (const pattern of this.#candidatePatterns(text)) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      if (pattern.loose && !match.slice(1).every(isShortCapture)) continue;
      const values = new Map<number, string>();
      pattern.slots.forEach((slot, index) => {
        const captured = match[index + 1] ?? "";
        values.set(slot, this.#translateNormalized(captured.trim(), depth + 1) ?? captured);
      });
      return pattern.target.replace(PLACEHOLDER, (placeholder, slot: string) => values.get(Number(slot)) ?? placeholder);
    }
    return null;
  }

  #translateList(text: string): string | null {
    for (const separator of SEPARATORS) {
      if (!text.includes(separator)) continue;
      const parts = text.split(separator);
      const translated = parts.map((part) => this.#translateNormalized(part.trim(), 0));
      if (translated.every((part) => part !== null)) return translated.join(separator);
    }
    return null;
  }
}
