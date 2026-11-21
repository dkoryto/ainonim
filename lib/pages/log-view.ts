// Pieces of the masking log's views, shared by the "Dziennik" tab and the printable report:
// the summary figures, a ranking list and the table of entries. Built with DOM calls and
// textContent only, so nothing stored can turn into markup.

import { formatDateTime, describeCategories } from '~/lib/log/csv';
import {
  type LogEntry,
  type LogSummary,
  type Ranked,
  SOURCE_LABELS,
} from '~/lib/shared/log-entries';
import { labelFor } from '~/lib/shared/labels';
import { make } from '~/lib/pages/options/dom';

const number = new Intl.NumberFormat('pl-PL');
export const formatCount = (n: number): string => number.format(n);

function stat(doc: Document, term: string, value: string, detail: string): HTMLElement {
  const box = make(doc, 'div', 'stat');
  const dd = make(doc, 'dd', undefined, value);
  dd.append(make(doc, 'span', 'stat-detail', detail));
  box.append(make(doc, 'dt', undefined, term), dd);
  return box;
}

/** The headline figures: maskings (by source), values (tokens / generalised), sites, period. */
export function summaryStats(doc: Document, summary: LogSummary): HTMLElement {
  const stats = make(doc, 'dl', 'log-stats');
  const period =
    summary.first === null || summary.last === null
      ? '–'
      : `${formatDateTime(summary.first).slice(0, 10)} – ${formatDateTime(summary.last).slice(0, 10)}`;
  stats.append(
    stat(
      doc,
      'Maskowania',
      formatCount(summary.maskings),
      `ręcznie ${formatCount(summary.bySource.manual)}, automatycznie ${formatCount(summary.bySource.auto)}`,
    ),
    stat(
      doc,
      'Zamaskowane dane',
      formatCount(summary.values),
      `znaczniki ${formatCount(summary.masked)}, ogólnie ${formatCount(summary.generalised)}`,
    ),
    stat(doc, 'Strony', formatCount(summary.sites.length), period),
  );
  return stats;
}

/** A titled list of names with counts, at most `limit` rows. */
export function rankList(
  doc: Document,
  title: string,
  rows: readonly Ranked[],
  nameOf: (name: string) => string,
  limit = Infinity,
): HTMLElement {
  const section = make(doc, 'section', 'rank-section');
  section.append(make(doc, 'h3', undefined, title));
  if (rows.length === 0) {
    section.append(make(doc, 'p', 'log-note', 'Brak danych.'));
    return section;
  }
  const list = make(doc, 'ol', 'rank');
  for (const row of rows.slice(0, limit)) {
    const item = make(doc, 'li');
    item.append(
      make(doc, 'span', 'rank-name', nameOf(row.name)),
      make(doc, 'span', 'rank-count', formatCount(row.count)),
    );
    list.append(item);
  }
  section.append(list);
  return section;
}

export const categoryName = (type: string): string => labelFor(type);

/** A table of `entries` in the order given. */
export function entriesTable(doc: Document, entries: readonly LogEntry[]): HTMLTableElement {
  const table = make(doc, 'table', 'log-table');
  const head = make(doc, 'thead');
  const headRow = make(doc, 'tr');
  for (const [text, numeric] of [
    ['Data', false],
    ['Strona', false],
    ['Sposób', false],
    ['Dane', true],
    ['Kategorie', false],
  ] as const) {
    const th = make(doc, 'th', numeric ? 'num' : undefined, text);
    th.scope = 'col';
    headRow.append(th);
  }
  head.append(headRow);
  const body = make(doc, 'tbody');
  for (const entry of entries) {
    const row = make(doc, 'tr');
    const total = entry.masked + entry.generalised;
    const values = make(doc, 'td', 'num', formatCount(total));
    if (entry.generalised > 0) values.title = `ogólnie: ${formatCount(entry.generalised)}`;
    row.append(
      make(doc, 'td', undefined, formatDateTime(entry.at)),
      make(doc, 'td', undefined, entry.host),
      make(doc, 'td', undefined, SOURCE_LABELS[entry.source]),
      values,
      make(doc, 'td', undefined, describeCategories(entry.categories)),
    );
    body.append(row);
  }
  table.append(head, body);
  return table;
}
