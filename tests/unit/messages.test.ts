import { describe, expect, it } from 'vitest';
import {
  MAX_TEXT_LENGTH,
  checkTextLength,
  isAnalyzeResponse,
  isContentRequest,
  isOffscreenRequest,
  isReadyResponse,
  isRestoreResponse,
  parseAnalyzeResult,
} from '~/lib/messages';

const analyzeResult = {
  anonymized: '<OSOBA_1>, PESEL <PESEL_1>',
  spans: [
    { start: 0, end: 12, entity_type: 'PERSON', score: 0.9 },
    { start: 20, end: 31, entity_type: 'PESEL', score: 1.0 },
  ],
  mapping: { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' },
};

describe('parseAnalyzeResult', () => {
  it('returns the result of ainonim_bridge.analyze', () => {
    const result = parseAnalyzeResult(JSON.stringify(analyzeResult));

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

describe('isContentRequest', () => {
  it.each([
    ['analyze without a mapping', { type: 'ainonim/analyze', id: '1', text: 'Jan' }],
    ['analyze with a mapping', { type: 'ainonim/analyze', id: '1', text: 'Jan', mapping: {} }],
    [
      'restore',
      { type: 'ainonim/restore', id: '1', text: '<OSOBA_1>', mapping: { '<OSOBA_1>': 'Jan' } },
    ],
  ])('accepts %s', (_case, message) => {
    expect(isContentRequest(message)).toBe(true);
  });

  it.each([
    ['restore without a mapping', { type: 'ainonim/restore', id: '1', text: 'a' }],
    ['a mapping with a number', { type: 'ainonim/analyze', id: '1', text: 'a', mapping: { a: 1 } }],
    ['a mapping that is an array', { type: 'ainonim/analyze', id: '1', text: 'a', mapping: [] }],
    ['a missing text', { type: 'ainonim/analyze', id: '1' }],
    ['a numeric id', { type: 'ainonim/analyze', id: 1, text: 'a' }],
    [
      'an offscreen request',
      { type: 'ainonim/offscreen-analyze', id: '1', text: 'a', mapping: {} },
    ],
    ['null', null],
  ])('rejects %s', (_case, message) => {
    expect(isContentRequest(message)).toBe(false);
  });
});

describe('isOffscreenRequest', () => {
  it('accepts the three offscreen operations and nothing from content scripts', () => {
    const messages = [
      { type: 'ainonim/offscreen-ready', id: '1' },
      { type: 'ainonim/offscreen-analyze', id: '1', text: 'a', mapping: {} },
      { type: 'ainonim/offscreen-restore', id: '1', text: 'a', mapping: {} },
      { type: 'ainonim/analyze', id: '1', text: 'a', mapping: {} },
      { type: 'ainonim/offscreen-restore', id: '1', text: 'a' },
    ];

    expect(messages.map(isOffscreenRequest)).toEqual([true, true, true, false, false]);
  });
});

describe('response guards', () => {
  it('accept successes and failures with a known error code', () => {
    const analyze = { id: '1', ok: true, result: analyzeResult, analyzeMs: 1, loadMs: 2 };
    const failure = { id: '1', ok: false, code: 'timeout', error: 'too slow' };

    expect(isAnalyzeResponse(analyze)).toBe(true);
    expect(isRestoreResponse({ id: '1', ok: true, text: 'Jan' })).toBe(true);
    expect(isReadyResponse({ id: '1', ok: true, loadMs: 1 })).toBe(true);
    expect(
      [isAnalyzeResponse, isRestoreResponse, isReadyResponse].map((is) => is(failure)),
    ).toEqual([true, true, true]);
  });

  it.each([
    ['an unknown error code', { id: '1', ok: false, code: 'oops', error: 'x' }],
    ['a failure without a message', { id: '1', ok: false, code: 'engine' }],
    ['a success without text', { id: '1', ok: true }],
    ['a missing id', { ok: true, text: 'Jan' }],
    ['undefined (no listener answered)', undefined],
  ])('reject %s', (_case, response) => {
    expect(isRestoreResponse(response)).toBe(false);
  });

  it('rejects an analyze success with a malformed result', () => {
    const response = { id: '1', ok: true, result: { anonymized: '' }, analyzeMs: 1, loadMs: 2 };

    expect(isAnalyzeResponse(response)).toBe(false);
  });
});

describe('checkTextLength', () => {
  it('accepts text up to the limit and rejects one character more', () => {
    expect(checkTextLength('1', 'a'.repeat(MAX_TEXT_LENGTH))).toBeUndefined();
    expect(checkTextLength('1', 'a'.repeat(MAX_TEXT_LENGTH + 1))).toEqual({
      id: '1',
      ok: false,
      code: 'too-long',
      error: 'Text is too long: 50001 characters, the limit is 50000.',
    });
  });
});
