import { describe, expect, it } from 'vitest';
import {
  MAX_CUSTOM_MATCHES,
  checkCustomWord,
  compileCustomWords,
  findCustomMatches,
  hasNestedQuantifier,
} from '~/lib/shared/custom-words';

const word = (value: string) => ({ value, regex: false });
const regex = (value: string) => ({ value, regex: true });

/** The matched texts, in order. */
function matched(text: string, ...entries: { value: string; regex: boolean }[]): string[] {
  return findCustomMatches(text, compileCustomWords(entries)).map(({ start, end }) =>
    text.slice(start, end),
  );
}

describe('plain words', () => {
  it('match whole words only, ignoring case', () => {
    expect(matched('Feniks, FENIKS i feniksy', word('feniks'))).toEqual(['Feniks', 'FENIKS']);
  });

  it('treat Polish letters as part of the word', () => {
    // With `\b`, "Łódź" would be found in "Łódźka" and "Łódź" inside "ąŁódź" missed the boundary.
    expect(matched('Łódź, Łódźka, zŁódź, ŁÓDŹ.', word('łódź'))).toEqual(['Łódź', 'ŁÓDŹ']);
    expect(matched('Żółć i żółćżółć', word('żółć'))).toEqual(['Żółć']);
  });

  it('match a phrase across any whitespace', () => {
    expect(matched('Projekt\n  Feniks rusza', word('projekt feniks'))).toEqual([
      'Projekt\n  Feniks',
    ]);
  });

  it('match regex metacharacters literally when not flagged as a regex', () => {
    expect(matched('Piszę w C++ i C', word('C++'))).toEqual(['C++']);
    expect(matched('a.b axb', word('a.b'))).toEqual(['a.b']);
  });
});

describe('regex entries', () => {
  it('match as written, ignoring case', () => {
    expect(matched('Sprawa KS-123/24 i ks-9/1', regex('KS-\\d+/\\d+'))).toEqual([
      'KS-123/24',
      'ks-9/1',
    ]);
  });

  it.each([
    ['[a-z', 'invalid'],
    ['(a+)+$', 'slow'],
    ['(\\w*x)*', 'slow'],
    ['((ab)+c)+', 'slow'],
    ['(a{2,})*', 'slow'],
    ['a*', 'empty'],
    ['x|', 'empty'],
  ])('reject %s as %s', (value, problem) => {
    expect(checkCustomWord(regex(value))).toEqual({ ok: false, problem });
    expect(matched('aaaa xx abab', regex(value))).toEqual([]);
  });

  it.each(['(ab)+', '[(+)]+', '\\(a+\\)+', 'a+b+', '(?:ab|cd){1,3}'])('accept %s', (value) => {
    expect(hasNestedQuantifier(value)).toBe(false);
    expect(checkCustomWord(regex(value)).ok).toBe(true);
  });

  it('keep the other entries working beside an invalid one', () => {
    expect(matched('Feniks', regex('('), word('feniks'))).toEqual(['Feniks']);
  });
});

describe('findCustomMatches', () => {
  it('returns sorted, non-overlapping matches: earlier start, then the longer one wins', () => {
    const text = 'Jan Feniks Kowalski';
    expect(matched(text, word('Feniks Kowalski'), word('Jan Feniks'), word('Feniks'))).toEqual([
      'Jan Feniks',
    ]);
    expect(matched('Feniks Kowalski', word('Feniks'), word('Feniks Kowalski'))).toEqual([
      'Feniks Kowalski',
    ]);
  });

  it('skips zero-length matches', () => {
    expect(matched('abc', regex('(?=b)'), regex('\\bb?'))).toEqual([]);
  });

  it('never matches inside a token already in the text', () => {
    expect(matched('<OSOBA_1> i OSOBA', regex('OSOBA'))).toEqual(['OSOBA']);
  });

  it(`stops at ${String(MAX_CUSTOM_MATCHES)} matches`, () => {
    const text = 'x '.repeat(MAX_CUSTOM_MATCHES + 50);
    expect(matched(text, word('x'))).toHaveLength(MAX_CUSTOM_MATCHES);
  });

  it('finds nothing without patterns or text', () => {
    expect(findCustomMatches('Feniks', [])).toEqual([]);
    expect(matched('', word('x'))).toEqual([]);
  });
});
