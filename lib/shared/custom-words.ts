// Finding the user's own words and patterns ("Własne słowa") in a text. Pure functions: the
// service worker turns the matches into spans (lib/background/refine.ts) and the options page uses
// `checkCustomWord` to mark entries that will be ignored.
//
// The patterns are the user's own, but they run over every text typed on every page, and a
// JavaScript regex cannot be interrupted. Hence the caps: entry length and count
// (lib/settings/detection.ts), matches per text, and no nested unbounded quantifiers, the usual cause
// of catastrophic backtracking.

import { findTokens } from './tokens';

/**
 * One of the user's own words or phrases to mask ("Własne słowa" tab). With `regex` the value is
 * a regular expression; without, it matches as a whole word, ignoring case. Kept in storage.sync
 * so the list survives a reinstall; it never leaves the browser's own sync.
 */
export interface CustomWord {
  value: string;
  regex: boolean;
}

/** Most matches taken from one text; anything beyond is left to the engine. */
export const MAX_CUSTOM_MATCHES = 500;

export interface TextRange {
  start: number;
  end: number;
}

/** Why an entry is ignored, as the options page says it. */
export type CustomWordProblem = 'invalid' | 'slow' | 'empty';

export const PROBLEM_TEXT: Readonly<Record<CustomWordProblem, string>> = {
  invalid: 'Nieprawidłowe wyrażenie regularne',
  slow: 'Wzorzec może działać zbyt wolno (zagnieżdżone powtórzenia)',
  empty: 'Wzorzec pasuje do pustego tekstu',
};

export type CheckedWord = { ok: true; pattern: RegExp } | { ok: false; problem: CustomWordProblem };

// Letters and digits of any script, so "Łódź" is a whole word in "w Łodzi i Łódź," and `ś` does
// not count as a word boundary the way it would for `\b`.
const BEFORE_WORD = '(?<![\\p{L}\\p{N}_])';
const AFTER_WORD = '(?![\\p{L}\\p{N}_])';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** A plain word as a pattern: whole words only, any run of whitespace where it has one. */
function wordSource(value: string): string {
  const body = value.split(/\s+/u).map(escapeRegex).join('\\s+');
  return `${BEFORE_WORD}${body}${AFTER_WORD}`;
}

/**
 * Whether `source` repeats a group that itself holds an unbounded repetition, as in `(a+)+` or
 * `(\w*x)*`: the shape that makes a backtracking engine take exponential time. A rough scan,
 * erring towards refusing; escapes and character classes are skipped.
 */
export function hasNestedQuantifier(source: string): boolean {
  // One entry per open group: whether an unbounded quantifier occurred inside it.
  const groups: boolean[] = [];
  let inClass = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') {
      index++;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === '(') groups.push(false);
    else if (
      char === '*' ||
      char === '+' ||
      (char === '{' && /^\{\d*,\}/.test(source.slice(index)))
    ) {
      if (groups.length > 0) groups[groups.length - 1] = true;
    } else if (char === ')') {
      const unboundedInside = groups.pop() ?? false;
      const next = source[index + 1];
      const repeated = next === '*' || next === '+' || next === '{';
      if (unboundedInside && repeated) return true;
      // The group's repetition counts for the group around it.
      if (unboundedInside && groups.length > 0) groups[groups.length - 1] = true;
    }
  }
  return false;
}

/** The entry as a global, case-insensitive Unicode regex, or why it cannot be used. */
export function checkCustomWord(word: CustomWord): CheckedWord {
  if (!word.regex) return { ok: true, pattern: new RegExp(wordSource(word.value), 'giu') };
  if (hasNestedQuantifier(word.value)) return { ok: false, problem: 'slow' };
  let pattern: RegExp;
  try {
    pattern = new RegExp(word.value, 'giu');
  } catch {
    return { ok: false, problem: 'invalid' };
  }
  // A pattern that matches nothing at all would only produce zero-length matches everywhere.
  if (new RegExp(`^(?:${word.value})$`, 'iu').test('')) return { ok: false, problem: 'empty' };
  return { ok: true, pattern };
}

/** The usable patterns of `words`; the others are skipped without a word, as the UI marks them. */
export function compileCustomWords(words: readonly CustomWord[]): RegExp[] {
  return words.flatMap((word) => {
    const checked = checkCustomWord(word);
    return checked.ok ? [checked.pattern] : [];
  });
}

const overlaps = (a: TextRange, b: TextRange): boolean => a.start < b.end && b.start < a.end;

/**
 * Where `patterns` match in `text`: sorted, non-overlapping (an earlier start wins, then the
 * longer match), never empty and never inside a token already in the text, such as `<OSOBA_1>`
 * from an earlier masking. At most MAX_CUSTOM_MATCHES.
 */
export function findCustomMatches(text: string, patterns: readonly RegExp[]): TextRange[] {
  if (patterns.length === 0 || text === '') return [];
  const tokens = findTokens(text);
  const found: TextRange[] = [];
  search: for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0] === '') continue;
      const range = { start: match.index, end: match.index + match[0].length };
      if (tokens.some((token) => overlaps(token, range))) continue;
      found.push(range);
      if (found.length >= MAX_CUSTOM_MATCHES) break search;
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: TextRange[] = [];
  for (const range of found) {
    const last = kept.at(-1);
    if (!last || range.start >= last.end) kept.push(range);
  }
  return kept;
}
