import { describe, expect, it } from 'vitest';
import {
  type LogEntry,
  MAX_LOG_ENTRIES,
  appendEntry,
  isMaskingReport,
  parseLog,
  reportOf,
  summarize,
  toLogEntry,
} from '~/lib/shared/log-entries';
import { isLogAppendRequest } from '~/lib/shared/messages';

const REPORT = { source: 'manual', masked: 2, generalised: 1, categories: { PERSON: 2, PESEL: 1 } };

function entry(at: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    at,
    host: 'chatgpt.com',
    source: 'auto',
    masked: 1,
    generalised: 0,
    categories: { PERSON: 1 },
    ...overrides,
  };
}

describe('isMaskingReport', () => {
  it('accepts counts that add up per category', () => {
    expect(isMaskingReport(REPORT)).toBe(true);
    expect(isMaskingReport({ ...REPORT, source: 'auto' })).toBe(true);
  });

  it.each([
    ['an unknown source', { ...REPORT, source: 'ręcznie' }],
    ['a negative count', { ...REPORT, masked: -1, categories: { PERSON: 0 } }],
    ['a fraction', { ...REPORT, masked: 1.5 }],
    ['nothing masked', { ...REPORT, masked: 0, generalised: 0, categories: {} }],
    ['categories that do not add up', { ...REPORT, categories: { PERSON: 1 } }],
    ['a value instead of a type', { ...REPORT, categories: { PERSON: 2, 'Jan Kowalski': 1 } }],
    ['a token instead of a type', { ...REPORT, categories: { PERSON: 2, '<PESEL_1>': 1 } }],
    ['a zero count', { ...REPORT, categories: { PERSON: 2, PESEL: 1, EMAIL: 0 } }],
    ['too many values', { ...REPORT, masked: 10_001, generalised: 0, categories: { X: 10_001 } }],
    ['categories as an array', { ...REPORT, categories: [3] }],
    ['null', null],
  ])('refuses %s', (_name, value) => {
    expect(isMaskingReport(value)).toBe(false);
  });

  it('validates the append message the same way, with its type and id', () => {
    expect(isLogAppendRequest({ type: 'ainonim/log-append', id: 'a', ...REPORT })).toBe(true);
    expect(isLogAppendRequest({ type: 'ainonim/log-append', ...REPORT })).toBe(false);
    expect(isLogAppendRequest({ type: 'ainonim/analyze', id: 'a', ...REPORT })).toBe(false);
  });
});

describe('toLogEntry / parseLog', () => {
  it('keeps only the report fields, with the given host and time', () => {
    const sent = { type: 'ainonim/log-append', id: 'x', text: 'Jan Kowalski', ...REPORT };
    const made = toLogEntry(sent as typeof REPORT & { source: 'manual' }, 'example.com', 5);

    expect(made).toEqual({ at: 5, host: 'example.com', ...REPORT });
    expect(Object.keys(made)).not.toContain('text');
  });

  it('drops malformed stored entries', () => {
    expect(
      parseLog([entry(1), { at: 2 }, 'x', entry(3, { host: 7 as unknown as string })]),
    ).toEqual([entry(1)]);
    expect(parseLog({ 0: entry(1) })).toEqual([]);
  });
});

describe('appendEntry', () => {
  it('appends newest last and drops the oldest beyond the cap', () => {
    const log = [entry(1), entry(2), entry(3)];

    expect(appendEntry(log, entry(4), 3).map((e) => e.at)).toEqual([2, 3, 4]);
    expect(appendEntry(log, entry(4)).map((e) => e.at)).toEqual([1, 2, 3, 4]);
    expect(log).toHaveLength(3);
  });

  it('caps at 1000 by default', () => {
    const full = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) => entry(i));

    const next = appendEntry(full, entry(MAX_LOG_ENTRIES));

    expect(next).toHaveLength(MAX_LOG_ENTRIES);
    expect(next[0]?.at).toBe(1);
    expect(next.at(-1)?.at).toBe(MAX_LOG_ENTRIES);
  });
});

describe('summarize', () => {
  it('adds up maskings, values, sources, categories and sites', () => {
    const summary = summarize([
      entry(30, { categories: { PERSON: 1 } }),
      entry(10, {
        host: 'claude.ai',
        source: 'manual',
        masked: 2,
        generalised: 1,
        categories: { PESEL: 2, PERSON: 1 },
      }),
      entry(20, { masked: 1, categories: { PESEL: 1 } }),
    ]);

    expect(summary).toEqual({
      maskings: 3,
      values: 5,
      masked: 4,
      generalised: 1,
      bySource: { manual: 1, auto: 2 },
      categories: [
        { name: 'PESEL', count: 3 },
        { name: 'PERSON', count: 2 },
      ],
      sites: [
        { name: 'chatgpt.com', count: 2 },
        { name: 'claude.ai', count: 1 },
      ],
      first: 10,
      last: 30,
    });
  });

  it('is all zeros for an empty log', () => {
    expect(summarize([])).toMatchObject({ maskings: 0, values: 0, first: null, last: null });
  });
});

describe('reportOf', () => {
  it('counts tokens and generalised values per type', () => {
    expect(
      reportOf('auto', [
        { entityType: 'PERSON', general: false },
        { entityType: 'PERSON', general: true },
        { entityType: 'PESEL', general: false },
      ]),
    ).toEqual({ source: 'auto', masked: 2, generalised: 1, categories: { PERSON: 2, PESEL: 1 } });
  });

  it('counts a type the log would refuse as OTHER, so the report stays valid', () => {
    const report = reportOf('manual', [{ entityType: 'własne słowo', general: false }]);

    expect(report.categories).toEqual({ OTHER: 1 });
    expect(isMaskingReport(report)).toBe(true);
  });
});
