// The masking log as CSV for a spreadsheet. Semicolons, because Polish Excel splits on them, and
// a byte order mark, so it reads the file as UTF-8.

import { labelFor } from '~/lib/ui/labels';
import { type LogEntry, SOURCE_LABELS } from './entries';

const SEPARATOR = ';';
const BOM = '﻿';

export const CSV_HEADER = [
  'data',
  'strona',
  'sposób',
  'zamaskowane',
  'uogólnione',
  'razem',
  'kategorie',
] as const;

/**
 * One cell, safe to open in a spreadsheet. A cell starting with `=`, `+`, `-` or `@` (or a tab or
 * carriage return, which some programs skip before looking) would run as a formula, so it gets a
 * leading apostrophe. Cells with a separator, quote or line break are quoted.
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local date and time as `2026-11-21 14:05:09`, which spreadsheets read as a date. */
export function formatDateTime(at: number): string {
  const date = new Date(at);
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** "osoba: 2, PESEL: 1": an entry's types by their Polish names, most values first. */
export function describeCategories(categories: Readonly<Record<string, number>>): string {
  return Object.entries(categories)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([type, count]) => `${labelFor(type)}: ${String(count)}`)
    .join(', ');
}

/** The log, oldest first as stored, with a header row; lines end with CRLF as RFC 4180 has it. */
export function toCsv(log: readonly LogEntry[]): string {
  const rows = [
    CSV_HEADER.map(csvCell),
    ...log.map((entry) =>
      [
        formatDateTime(entry.at),
        entry.host,
        SOURCE_LABELS[entry.source],
        entry.masked,
        entry.generalised,
        entry.masked + entry.generalised,
        describeCategories(entry.categories),
      ].map(csvCell),
    ),
  ];
  return BOM + rows.map((row) => row.join(SEPARATOR)).join('\r\n') + '\r\n';
}
