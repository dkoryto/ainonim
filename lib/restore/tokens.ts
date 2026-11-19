// Finding polanon tokens in text and putting the originals back. Pure functions, plus a small
// cache that turns the bridge's asynchronous declension into a synchronous lookup.

/** A polanon token found in text: `<OSOBA_1>` or, with a grammatical case, `<OSOBA_1:wołacz>`. */
export interface FoundToken {
  /** The token as written, e.g. `<OSOBA_1:wołacz>`. */
  token: string;
  /** The token without its case, e.g. `<OSOBA_1>`: the key of the mapping. */
  base: string;
  label: string;
  index: number;
  /** The grammatical case, e.g. `wołacz`, or undefined for a plain token. */
  grammaticalCase: string | undefined;
  /** UTF-16 offsets of the token in the text. */
  start: number;
  end: number;
}

/** Token -> original value, as in `AnalyzeResult.mapping`. */
export type Mapping = Readonly<Record<string, string>>;

/**
 * The original in the case a cased token asks for, or undefined when it is not known (yet).
 * `token` is the cased token as written, `original` the base form from the mapping.
 */
export type Decline = (token: string, original: string) => string | undefined;

// The whole token is one match, so `<OSOBA_1>` never matches inside `<OSOBA_12>`: the longest
// token always wins without sorting the mapping.
const TOKEN = /<([A-Z_]*[A-Z])_(\d+)(?::(\p{Ll}+))?>/gu;

export function findTokens(text: string): FoundToken[] {
  const found: FoundToken[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const [token, label = '', index = '', grammaticalCase] = match;
    found.push({
      token,
      base: `<${label}_${index}>`,
      label,
      index: Number(index),
      grammaticalCase,
      start: match.index,
      end: match.index + token.length,
    });
  }
  return found;
}

/**
 * The text a token stands for, or undefined when the token is unknown or its declension is not
 * available. An exact mapping entry wins over declining the base form.
 */
export function resolveToken(
  found: FoundToken,
  mapping: Mapping,
  decline?: Decline,
): string | undefined {
  const exact = Object.hasOwn(mapping, found.token) ? mapping[found.token] : undefined;
  if (exact !== undefined || found.grammaticalCase === undefined) return exact;
  const original = Object.hasOwn(mapping, found.base) ? mapping[found.base] : undefined;
  return original === undefined ? undefined : decline?.(found.token, original);
}

/** Replace every known token with its original; unknown or undeclined tokens stay as written. */
export function restoreTokens(text: string, mapping: Mapping, decline?: Decline): string {
  let result = '';
  let last = 0;
  for (const found of findTokens(text)) {
    const original = resolveToken(found, mapping, decline);
    if (original === undefined) continue;
    result += text.slice(last, found.start) + original;
    last = found.end;
  }
  return result + text.slice(last);
}

/** Asks polanon (through the bridge) for `original` in the case of the cased `token`. */
export type DeclineRequest = (token: string, original: string) => Promise<string | undefined>;

export interface DeclensionCache {
  /**
   * A `Decline` for `restoreTokens`: the cached declension, or undefined while the request is
   * pending. A miss starts the request; listeners are told when its answer arrives.
   */
  decline: Decline;
  /** Called after each declension arrives. Returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/**
 * Cache declensions requested from the bridge. A failed or empty answer is cached as the base
 * form, so a token is never left on screen just because declension is unavailable.
 */
export function createDeclensionCache(request: DeclineRequest): DeclensionCache {
  const values = new Map<string, string>();
  const pending = new Set<string>();
  const listeners = new Set<() => void>();

  const settle = (key: string, value: string): void => {
    pending.delete(key);
    values.set(key, value);
    for (const listener of listeners) listener();
  };

  return {
    decline(token, original) {
      const key = `${token}\u0000${original}`;
      const cached = values.get(key);
      if (cached !== undefined || pending.has(key)) return cached;
      pending.add(key);
      request(token, original).then(
        (value) => {
          settle(key, value ?? original);
        },
        () => {
          settle(key, original);
        },
      );
      return undefined;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
