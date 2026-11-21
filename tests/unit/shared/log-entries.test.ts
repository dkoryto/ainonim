import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CSV_HEADER, csvCell, describeCategories, toCsv } from '~/lib/log/csv';
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
import { LOG_STORAGE_KEY, appendLogEntry, clearLog, onLogChange, readLog } from '~/lib/log/store';
import { isLogAppendRequest } from '~/lib/shared/messages';
import { handleLogAppend, type LogDeps } from '~/lib/background/worker';

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

describe('csvCell', () => {
  it.each([
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ['+48 600', "'+48 600"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['\r=1', `"'\r=1"`],
    ['a;b', '"a;b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['chatgpt.com', 'chatgpt.com'],
    [12, '12'],
  ])('%j -> %j', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });
});

describe('toCsv', () => {
  it('writes a header and one row per entry with Polish names, CRLF and a BOM', () => {
    const at = new Date(2026, 10, 21, 9, 5, 7).getTime();
    const csv = toCsv([
      entry(at, { masked: 2, generalised: 1, categories: { PERSON: 1, PESEL: 2 } }),
    ]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      CSV_HEADER.join(';'),
      '2026-11-21 09:05:07;chatgpt.com;automatycznie;2;1;3;PESEL: 2, osoba: 1',
      '',
    ]);
  });

  it('neutralises a hostname that looks like a formula', () => {
    const csv = toCsv([entry(0, { host: '=cmd|x' })]);

    expect(csv).toContain(";'=cmd|x;");
  });

  it('describes categories most first, unknown types by their raw name', () => {
    expect(describeCategories({ EMAIL: 1, PERSON: 3, CUSTOM_X: 1 })).toBe(
      'osoba: 3, CUSTOM_X: 1, e-mail: 1',
    );
  });
});

describe('log store', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('appends, reads back, reports changes and clears', async () => {
    const seen: number[] = [];
    const stop = onLogChange((log) => seen.push(log.length));

    await Promise.all([appendLogEntry(entry(1)), appendLogEntry(entry(2))]);
    expect((await readLog()).map((e) => e.at)).toEqual([1, 2]);
    await clearLog();

    expect(await readLog()).toEqual([]);
    expect(seen).toEqual([1, 2, 0]);
    stop();
  });

  it('ignores a malformed stored value', async () => {
    await fakeBrowser.storage.local.set({ [LOG_STORAGE_KEY]: 'broken' });

    expect(await readLog()).toEqual([]);
    await appendLogEntry(entry(1));
    expect(await readLog()).toEqual([entry(1)]);
  });
});

describe('handleLogAppend', () => {
  function deps(enabled = true): LogDeps & { append: ReturnType<typeof vi.fn> } {
    return {
      append: vi.fn(() => Promise.resolve()),
      isEnabled: () => Promise.resolve(enabled),
      now: () => 42,
    };
  }
  const message = { type: 'ainonim/log-append', id: 'm1', ...REPORT };

  it('stores the entry under the sender frame host, not one the message names', async () => {
    const log = deps();

    const forged = { ...message, host: 'bank.pl', at: 1 } as { type: string };
    const response = await handleLogAppend(forged, 'https://Chatgpt.com:443/c/1', log);

    expect(response).toEqual({ id: 'm1', ok: true });
    expect(log.append).toHaveBeenCalledWith({ at: 42, host: 'chatgpt.com', ...REPORT });
  });

  it('answers ok and writes nothing while the log is turned off', async () => {
    const log = deps(false);

    expect(await handleLogAppend(message, 'https://chatgpt.com/', log)).toEqual({
      id: 'm1',
      ok: true,
    });
    expect(log.append).not.toHaveBeenCalled();
  });

  it('refuses a malformed report and a sender without a hostname', async () => {
    const log = deps();

    expect(
      await handleLogAppend(
        { ...message, masked: 'x' } as { type: string },
        'https://chatgpt.com/',
        log,
      ),
    ).toMatchObject({ id: 'm1', ok: false, code: 'invalid-request' });
    expect(await handleLogAppend(message, undefined, log)).toMatchObject({ code: 'forbidden' });
    expect(await handleLogAppend(message, 'file:///tmp/a.html', log)).toMatchObject({
      code: 'forbidden',
    });
    expect(log.append).not.toHaveBeenCalled();
  });

  it('reports a storage failure without details', async () => {
    const log = { ...deps(), append: vi.fn(() => Promise.reject(new Error('quota'))) };

    expect(await handleLogAppend(message, 'https://chatgpt.com/', log)).toEqual({
      id: 'm1',
      ok: false,
      code: 'engine',
      error: 'The masking log could not be written.',
    });
  });
});
