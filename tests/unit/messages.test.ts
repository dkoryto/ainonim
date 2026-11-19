import { describe, expect, it } from 'vitest';
import { isAnalyzeRequest, isOffscreenAnalyzeRequest, parseAnalyzeResult } from '~/lib/messages';

const bridgeOutput = JSON.stringify({
  anonymized: '<OSOBA_1>, PESEL <PESEL_1>',
  spans: [
    { start: 0, end: 12, entity_type: 'PERSON', score: 0.9 },
    { start: 20, end: 31, entity_type: 'PESEL', score: 1.0 },
  ],
  mapping: { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' },
});

describe('parseAnalyzeResult', () => {
  it('returns the result of ainonim_bridge.analyze', () => {
    const result = parseAnalyzeResult(bridgeOutput);

    expect(result.anonymized).toBe('<OSOBA_1>, PESEL <PESEL_1>');
    expect(result.spans.map((span) => span.entity_type)).toEqual(['PERSON', 'PESEL']);
    expect(result.mapping['<PESEL_1>']).toBe('50810112354');
  });

  it.each([
    ['a missing mapping', { anonymized: '', spans: [] }],
    [
      'a span with a fractional offset',
      {
        anonymized: '',
        spans: [{ start: 0.5, end: 1, entity_type: 'PESEL', score: 1 }],
        mapping: {},
      },
    ],
    ['a non-string original', { anonymized: '', spans: [], mapping: { '<PESEL_1>': 50810112354 } }],
    ['a JSON array', []],
  ])('rejects %s', (_case, value) => {
    expect(() => parseAnalyzeResult(JSON.stringify(value))).toThrow('Malformed');
  });
});

describe('request guards', () => {
  it('tells the content script request from the offscreen one', () => {
    const toWorker = { type: 'ainonim/analyze', id: '1', text: 'Jan' };
    const toOffscreen = { type: 'ainonim/offscreen-analyze', id: '1', text: 'Jan' };

    expect([isAnalyzeRequest(toWorker), isOffscreenAnalyzeRequest(toWorker)]).toEqual([
      true,
      false,
    ]);
    expect([isAnalyzeRequest(toOffscreen), isOffscreenAnalyzeRequest(toOffscreen)]).toEqual([
      false,
      true,
    ]);
  });

  it('rejects a request without text', () => {
    expect(isAnalyzeRequest({ type: 'ainonim/analyze', id: '1' })).toBe(false);
    expect(isOffscreenAnalyzeRequest(null)).toBe(false);
  });
});
