import { describe, expect, it } from 'vitest';
import { detectionRules, mergeCustomMatches, refineResult } from '~/lib/detection/refine';
import type { AnalyzeResult, Span } from '~/lib/messages';

const span = (start: number, end: number, entity_type: string, token: string): Span => ({
  start,
  end,
  entity_type,
  score: 0.9,
  token,
});

const rules = (disabled: string[], words: string[] = []) =>
  detectionRules({
    disabledCategories: disabled,
    customWords: words.map((value) => ({ value, regex: false })),
  });

describe('mergeCustomMatches', () => {
  const person = span(10, 22, 'PERSON', '<OSOBA_1>');

  it('lets a match replace the engine spans it covers whole', () => {
    const merged = mergeCustomMatches([person], [{ start: 0, end: 22 }]);
    expect(merged).toEqual({ spans: [], custom: [{ start: 0, end: 22 }] });
  });

  it('lets a match with exactly the span’s range win', () => {
    expect(mergeCustomMatches([person], [{ start: 10, end: 22 }]).custom).toHaveLength(1);
  });

  it('keeps the engine span when a match only overlaps it', () => {
    const merged = mergeCustomMatches([person], [{ start: 14, end: 30 }]);
    expect(merged).toEqual({ spans: [person], custom: [] });
  });

  it('keeps every engine span when a match covers one and cuts another', () => {
    const date = span(25, 35, 'DATE', '<DATA_1>');
    const merged = mergeCustomMatches([person, date], [{ start: 8, end: 30 }]);
    expect(merged).toEqual({ spans: [person, date], custom: [] });
  });
});

describe('refineResult', () => {
  const text = 'Jan Kowalski, Projekt Feniks, 12.03.2024';
  const engine: AnalyzeResult = {
    anonymized: '<OSOBA_1>, Projekt Feniks, <DATA_1>',
    spans: [span(0, 12, 'PERSON', '<OSOBA_1>'), span(30, 40, 'DATE', '<DATA_1>')],
    mapping: { '<OSOBA_1>': 'Jan Kowalski', '<DATA_1>': '12.03.2024' },
  };

  it('returns the engine result as it is without settings', () => {
    expect(refineResult(text, {}, engine, rules([]))).toEqual(engine);
  });

  it('drops the spans and new tokens of disabled categories', () => {
    const refined = refineResult(text, {}, engine, rules(['DATE']));

    expect(refined).toEqual({
      anonymized: '<OSOBA_1>, Projekt Feniks, 12.03.2024',
      spans: [engine.spans[0]],
      mapping: { '<OSOBA_1>': 'Jan Kowalski' },
    });
  });

  it('keeps tokens the mapping held before, even of a disabled category', () => {
    const known = { '<DATA_1>': '12.03.2024' };
    expect(refineResult(text, known, engine, rules(['DATE'])).mapping).toEqual({
      '<OSOBA_1>': 'Jan Kowalski',
      '<DATA_1>': '12.03.2024',
    });
  });

  it('adds custom words as CUSTOM spans with <SLOWO_n> tokens', () => {
    const refined = refineResult(text, {}, engine, rules([], ['projekt feniks']));

    expect(refined.anonymized).toBe('<OSOBA_1>, <SLOWO_1>, <DATA_1>');
    expect(refined.spans.map((found) => [found.entity_type, found.token])).toEqual([
      ['PERSON', '<OSOBA_1>'],
      ['CUSTOM', '<SLOWO_1>'],
      ['DATE', '<DATA_1>'],
    ]);
    expect(refined.mapping).toEqual({ ...engine.mapping, '<SLOWO_1>': 'Projekt Feniks' });
  });

  it('reuses the token of a value already mapped, in any case, and numbers new ones after', () => {
    const known = { '<SLOWO_1>': 'Orzeł', '<SLOWO_2>': 'PROJEKT FENIKS' };
    const mapping = { ...known, ...engine.mapping };
    const input = 'Projekt Feniks, Sokół, projekt feniks, Sokół';
    const refined = refineResult(
      input,
      known,
      { anonymized: input, spans: [], mapping },
      rules([], ['projekt feniks', 'sokół']),
    );

    expect(refined.anonymized).toBe('<SLOWO_2>, <SLOWO_3>, <SLOWO_2>, <SLOWO_3>');
    // The stored spelling stays.
    expect(refined.mapping).toEqual({ ...known, '<SLOWO_3>': 'Sokół' });
  });

  it('skips numbers the engine reserved for placeholders typed in the text', () => {
    const input = '<SLOWO_1> i Feniks';
    const refined = refineResult(
      input,
      {},
      { anonymized: input, spans: [], mapping: { '<SLOWO_1>': '<SLOWO_1>' } },
      rules([], ['feniks']),
    );

    expect(refined.anonymized).toBe('<SLOWO_1> i <SLOWO_2>');
    expect(refined.mapping).toEqual({ '<SLOWO_1>': '<SLOWO_1>', '<SLOWO_2>': 'Feniks' });
  });

  it('lets a custom word that contains a name win and drops the unused name token', () => {
    const refined = refineResult(text, {}, engine, rules([], ['Jan Kowalski, Projekt']));

    expect(refined.anonymized).toBe('<SLOWO_1> Feniks, <DATA_1>');
    expect(refined.mapping).toEqual({
      '<DATA_1>': '12.03.2024',
      '<SLOWO_1>': 'Jan Kowalski, Projekt',
    });
  });

  it('keeps the base token of a cased span', () => {
    const input = 'Jana Kowalskiego 1.02.2024';
    const engineCased: AnalyzeResult = {
      anonymized: '<OSOBA_1:dopełniacz> <DATA_1>',
      spans: [span(0, 16, 'PERSON', '<OSOBA_1:dopełniacz>'), span(17, 26, 'DATE', '<DATA_1>')],
      mapping: { '<OSOBA_1>': 'Jan Kowalski', '<DATA_1>': '1.02.2024' },
    };

    expect(refineResult(input, {}, engineCased, rules(['DATE']))).toEqual({
      anonymized: '<OSOBA_1:dopełniacz> 1.02.2024',
      spans: [engineCased.spans[0]],
      mapping: { '<OSOBA_1>': 'Jan Kowalski' },
    });
  });

  it('calls the engine’s spans of earlier custom tokens CUSTOM', () => {
    const input = 'Feniks';
    const refined = refineResult(
      input,
      { '<SLOWO_1>': 'Feniks' },
      {
        anonymized: '<SLOWO_1>',
        spans: [span(0, 6, 'SLOWO', '<SLOWO_1>')],
        mapping: { '<SLOWO_1>': 'Feniks' },
      },
      rules([]),
    );
    expect(refined.spans[0]?.entity_type).toBe('CUSTOM');
  });
});
