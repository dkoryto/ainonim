import { describe, expect, it } from 'vitest';
import { applyChoices, choicesFor, itemsOf, moveChoices } from '~/lib/content/masking-choices';
import type { Badge, MaskChoice } from '~/lib/content/ui/badge';
import type { AnalyzeResult, Span } from '~/lib/shared/messages';

const TEXT = 'Jan Kowalski, PESEL 50810112354';
const JAN: Span = { start: 0, end: 12, entity_type: 'PERSON', score: 1, token: '<OSOBA_1>' };
const PESEL: Span = { start: 20, end: 31, entity_type: 'PESEL', score: 1, token: '<PESEL_1>' };
const RESULT: AnalyzeResult = { anonymized: '', spans: [JAN, PESEL], mapping: {} };

describe('applyChoices', () => {
  it('writes each chosen value as its token or its generalised text', () => {
    expect(
      applyChoices(TEXT, [
        { span: JAN, mode: 'general' },
        { span: PESEL, mode: 'token' },
      ]),
    ).toBe('[osoba], PESEL <PESEL_1>');
  });
});

describe('itemsOf', () => {
  it('lists each value with its label, generalised text and a token by default', () => {
    expect(itemsOf(TEXT, RESULT)).toEqual([
      {
        span: JAN,
        original: 'Jan Kowalski',
        label: 'osoba',
        general: '[osoba]',
        defaultMode: 'token',
      },
      {
        span: PESEL,
        original: '50810112354',
        label: 'PESEL',
        general: '[PESEL]',
        defaultMode: 'token',
      },
    ]);
  });

  it('takes the default mode of each type from the setting', () => {
    const items = itemsOf(TEXT, RESULT, (type) => (type === 'PERSON' ? 'general' : 'token'));
    expect(items.map((item) => item.defaultMode)).toEqual(['general', 'token']);
  });
});

describe('choicesFor', () => {
  it('without a panel masks every value in its default mode, a token when it has none', () => {
    const [jan, pesel] = itemsOf(TEXT, RESULT).map((item) => ({ ...item }));
    if (!jan || !pesel) throw new Error('two items expected');
    jan.defaultMode = 'general';
    pesel.defaultMode = undefined;
    expect(choicesFor(null, [jan, pesel])).toEqual([
      { span: JAN, mode: 'general' },
      { span: PESEL, mode: 'token' },
    ]);
  });

  it('asks the panel when there is one', () => {
    const chosen: MaskChoice[] = [{ span: PESEL, mode: 'token' }];
    const badge = { choicesFor: () => chosen } as unknown as Badge;
    expect(choicesFor(badge, itemsOf(TEXT, RESULT))).toBe(chosen);
  });
});

describe('moveChoices', () => {
  it('gives token choices the tokens of the other analysis and keeps generalised ones', () => {
    const stored: Span[] = [
      { ...JAN, token: '<OSOBA_7>' },
      { ...PESEL, token: '<PESEL_7>' },
    ];
    expect(
      moveChoices(
        [
          { span: JAN, mode: 'token' },
          { span: PESEL, mode: 'general' },
        ],
        stored,
      ),
    ).toEqual([
      { span: stored[0], mode: 'token' },
      { span: PESEL, mode: 'general' },
    ]);
  });

  it('drops a token choice whose value the other analysis did not find', () => {
    const elsewhere: Span = { ...JAN, entity_type: 'ORG' };
    expect(moveChoices([{ span: JAN, mode: 'token' }], [elsewhere])).toEqual([]);
  });
});
