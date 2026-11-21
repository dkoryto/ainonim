import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvCell, describeCategories, toCsv } from '~/lib/log/csv';
import { type LogEntry } from '~/lib/shared/log-entries';

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
