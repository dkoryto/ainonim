// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { formatDateTime } from '~/lib/log/csv';
import { LOG_STORAGE_KEY } from '~/lib/log/store';
import type { LogEntry } from '~/lib/shared/log-entries';
import { renderReport, showReport } from '~/lib/pages/report';

const NOW = new Date(2026, 10, 20, 12, 30, 0).getTime();

function entry(index: number): LogEntry {
  return {
    at: NOW - (100 - index) * 60_000,
    host: index % 2 === 0 ? 'chatgpt.com' : 'claude.ai',
    source: 'manual',
    masked: 2,
    generalised: 0,
    categories: { PERSON: 1, PESEL: 1 },
  };
}

async function storeLog(count: number): Promise<LogEntry[]> {
  const log = Array.from({ length: count }, (_, index) => entry(index));
  await fakeBrowser.storage.local.set({ [LOG_STORAGE_KEY]: log });
  return log;
}

function root(): HTMLElement {
  const element = document.createElement('main');
  element.setAttribute('aria-busy', 'true');
  document.body.append(element);
  return element;
}

const headings = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('h1, h2'), (heading) => heading.textContent);

const tableHosts = (element: HTMLElement) =>
  Array.from(element.querySelectorAll('tbody tr'), (row) => row.children[1]?.textContent);

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('renderReport', () => {
  it('dates the report and says when the log is empty', async () => {
    const report = root();

    await renderReport(report, NOW);

    expect(report.textContent).toContain(`Wygenerowano: ${formatDateTime(NOW)}`);
    expect(report.textContent).toContain('Dziennik jest pusty.');
    expect(report.querySelector('table')).toBeNull();
  });

  it('lists every masking, newest first, under the summary', async () => {
    const log = await storeLog(3);
    const report = root();

    await renderReport(report, NOW);

    expect(headings(report)).toEqual([
      'AInonim – raport maskowania danych osobowych',
      'Podsumowanie',
      'Maskowania',
    ]);
    expect(tableHosts(report)).toEqual(log.map((item) => item.host).reverse());
    expect(report.textContent).toContain('Strony (liczba maskowań)');
  });

  it('lists only the 50 latest maskings of a longer log, and says so', async () => {
    const log = await storeLog(60);
    const report = root();

    await renderReport(report, NOW);

    expect(headings(report)).toContain('Ostatnie maskowania (50 z 60)');
    const times = Array.from(
      report.querySelectorAll('tbody tr'),
      (row) => row.firstElementChild?.textContent,
    );
    expect(times).toHaveLength(50);
    expect(times[0]).toBe(formatDateTime(log[59]?.at ?? 0));
    expect(times[49]).toBe(formatDateTime(log[10]?.at ?? 0));
  });
});

describe('showReport', () => {
  it('draws the report, then opens the print dialog after layout', async () => {
    await storeLog(1);
    const report = root();
    const print = vi.fn();

    await showReport(report, print);

    expect(report.hasAttribute('aria-busy')).toBe(false);
    expect(report.querySelector('table')).not.toBeNull();
    expect(print).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
  });

  it('says the log could not be read and still offers to print', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(new Error('Storage is gone.'));
    const report = root();
    const print = vi.fn();

    await showReport(report, print);

    expect(report.textContent).toBe('Nie udało się odczytać dziennika.');
    expect(report.hasAttribute('aria-busy')).toBe(false);
    await vi.waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
  });
});
