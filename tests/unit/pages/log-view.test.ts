// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { type LogEntry, summarize } from '~/lib/shared/log-entries';
import { entriesTable, formatCount, rankList, summaryStats } from '~/lib/pages/log-view';

const texts = (root: Element, selector: string): (string | null)[] =>
  [...root.querySelectorAll(selector)].map((element) => element.textContent);

describe('summaryStats', () => {
  it('shows zeros and no period for an empty log', () => {
    const stats = summaryStats(document, summarize([]));

    expect(texts(stats, 'dt')).toEqual(['Maskowania', 'Zamaskowane dane', 'Strony']);
    expect(stats.querySelector('.stat:last-child .stat-detail')?.textContent).toBe('–');
  });
});

describe('rankList', () => {
  const rows = [
    { name: 'PERSON', count: 1200 },
    { name: 'PESEL', count: 3 },
    { name: 'IBAN', count: 1 },
  ];

  it('lists names with Polish-formatted counts, up to the limit', () => {
    const section = rankList(document, 'Kategorie', rows, (name) => name.toLowerCase(), 2);

    expect(section.querySelector('h3')?.textContent).toBe('Kategorie');
    expect(texts(section, '.rank-name')).toEqual(['person', 'pesel']);
    expect(texts(section, '.rank-count')).toEqual([formatCount(1200), '3']);
  });

  it('says there is no data instead of an empty list', () => {
    const section = rankList(document, 'Strony', [], (name) => name);

    expect(section.querySelector('ol')).toBeNull();
    expect(section.querySelector('.log-note')?.textContent).toBe('Brak danych.');
  });
});

describe('entriesTable', () => {
  const entry: LogEntry = {
    at: new Date(2026, 10, 1, 12, 0, 0).getTime(),
    host: 'claude.ai',
    source: 'manual',
    masked: 2,
    generalised: 1,
    categories: { PERSON: 2, DATE: 1 },
  };

  it('shows one row per entry with the total and how many values were generalised', () => {
    const table = entriesTable(document, [entry, { ...entry, generalised: 0 }]);

    const [first, second] = [...table.querySelectorAll('tbody tr')];
    expect(texts(table, 'th')).toEqual(['Data', 'Strona', 'Sposób', 'Dane', 'Kategorie']);
    expect(first?.querySelectorAll('td')[1]?.textContent).toBe('claude.ai');
    expect(first?.querySelector('td.num')?.textContent).toBe('3');
    expect(first?.querySelector<HTMLElement>('td.num')?.title).toBe('ogólnie: 1');
    expect(second?.querySelector<HTMLElement>('td.num')?.title).toBe('');
  });
});
