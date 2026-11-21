import { describe, expect, it } from 'vitest';
import {
  MANAGE_REQUEST_TYPES,
  MAX_TEXT_LENGTH,
  checkTextLength,
  isAnalyzeResponse,
  isContentRequest,
  isDoneResponse,
  isManageRequest,
  isMappingsChangedNotice,
  isMappingsListResponse,
  isOffscreenRequest,
  isReadyResponse,
  isRestoreResponse,
  parseAnalyzeResult,
} from '~/lib/messages';

const analyzeResult = {
  anonymized: '<OSOBA_1>, PESEL <PESEL_1>',
  spans: [
    { start: 0, end: 12, entity_type: 'PERSON', score: 0.9, token: '<OSOBA_1>' },
    { start: 20, end: 31, entity_type: 'PESEL', score: 1.0, token: '<PESEL_1>' },
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
        spans: [{ start: 0.5, end: 1, entity_type: 'PESEL', score: 1, token: '<PESEL_1>' }],
        mapping: {},
      },
    ],
    [
      'a span without a token',
      {
        anonymized: '',
        spans: [{ start: 0, end: 1, entity_type: 'PESEL', score: 1 }],
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
    [
      'analyze in a conversation',
      { type: 'ainonim/analyze', id: '1', text: 'a', conversationKey: 'chatgpt:x', persist: true },
    ],
    ['mapping-get', { type: 'ainonim/mapping-get', id: '1', conversationKey: 'chatgpt:x' }],
    [
      'mapping-rename',
      { type: 'ainonim/mapping-rename', id: '1', fromKey: 'chatgpt:a', toKey: 'chatgpt:b' },
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
    [
      'a conversation key with a mapping',
      { type: 'ainonim/analyze', id: '1', text: 'a', conversationKey: 'chatgpt:x', mapping: {} },
    ],
    [
      'persist without a conversation',
      { type: 'ainonim/analyze', id: '1', text: 'a', persist: true },
    ],
    ['a numeric conversation key', { type: 'ainonim/mapping-get', id: '1', conversationKey: 1 }],
    [
      'a rename without a target',
      { type: 'ainonim/mapping-rename', id: '1', fromKey: 'chatgpt:a' },
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

describe('isManageRequest', () => {
  it.each([
    ['mappings-list', { type: 'ainonim/mappings-list', id: '1' }],
    ['mapping-delete', { type: 'ainonim/mapping-delete', id: '1', conversationKey: 'chatgpt:x' }],
    ['mappings-clear', { type: 'ainonim/mappings-clear', id: '1' }],
  ])('accepts %s', (_case, message) => {
    expect(isManageRequest(message)).toBe(true);
    expect(isContentRequest(message)).toBe(false);
    expect(MANAGE_REQUEST_TYPES).toContain(message.type);
  });

  it.each([
    ['a delete without a key', { type: 'ainonim/mapping-delete', id: '1' }],
    ['a numeric key', { type: 'ainonim/mapping-delete', id: '1', conversationKey: 1 }],
    ['a numeric id', { type: 'ainonim/mappings-list', id: 1 }],
    ['a content request', { type: 'ainonim/mapping-get', id: '1', conversationKey: 'chatgpt:x' }],
    ['null', null],
  ])('rejects %s', (_case, message) => {
    expect(isManageRequest(message)).toBe(false);
  });
});

describe('isMappingsChangedNotice', () => {
  it('accepts the notice and nothing else', () => {
    expect(isMappingsChangedNotice({ type: 'ainonim/mappings-changed' })).toBe(true);
    expect(isMappingsChangedNotice({ type: 'ainonim/mappings-list', id: '1' })).toBe(false);
    expect(isMappingsChangedNotice('ainonim/mappings-changed')).toBe(false);
  });
});

describe('manage response guards', () => {
  it('accept a list of conversations and a done answer', () => {
    const conversations = [{ key: 'chatgpt:x', mapping: { '<OSOBA_1>': 'Jan' } }];

    expect(isMappingsListResponse({ id: '1', ok: true, conversations })).toBe(true);
    expect(isMappingsListResponse({ id: '1', ok: true, conversations: [] })).toBe(true);
    expect(isDoneResponse({ id: '1', ok: true })).toBe(true);
    expect(isDoneResponse({ id: '1', ok: false, code: 'forbidden', error: '' })).toBe(true);
  });

  it.each([
    ['no list', { id: '1', ok: true }],
    ['a conversation without a key', { id: '1', ok: true, conversations: [{ mapping: {} }] }],
    [
      'a malformed mapping',
      { id: '1', ok: true, conversations: [{ key: 'chatgpt:x', mapping: { a: 1 } }] },
    ],
    ['an unknown error code', { id: '1', ok: false, code: 'nope', error: '' }],
  ])('reject a list response with %s', (_case, response) => {
    expect(isMappingsListResponse(response)).toBe(false);
  });
});
