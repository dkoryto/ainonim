// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { LogEntry } from '~/lib/shared/log-entries';
import {
  type LogTabDeps,
  PAGE_SIZE,
  REPORT_PATH,
  csvFileName,
  mountLog,
} from '~/lib/pages/options/log';

function entry(index: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    at: new Date(2026, 10, 1, 12, 0, index % 60).getTime() + index * 60_000,
    host: index % 2 === 0 ? 'chatgpt.com' : 'claude.ai',
    source: 'auto',
    masked: 1,
    generalised: 0,
    categories: { PERSON: 1 },
    ...overrides,
  };
}

interface Harness {
  panel: HTMLElement;
  deps: LogTabDeps;
  emit: (log: LogEntry[]) => void;
  setEnabled: (enabled: boolean) => void;
}

async function mount(log: LogEntry[], enabled = true): Promise<Harness> {
  const panel = document.createElement('section');
  document.body.replaceChildren(panel);
  let emit: (log: LogEntry[]) => void = () => undefined;
  let setEnabled: (enabled: boolean) => void = () => undefined;
  const deps: LogTabDeps = {
    read: vi.fn(() => Promise.resolve(log)),
    clear: vi.fn(() => Promise.resolve()),
    onChange: (callback) => {
      emit = callback;
      return () => undefined;
    },
    isEnabled: () => Promise.resolve(enabled),
    onEnabledChange: (callback) => {
      setEnabled = callback;
      return () => undefined;
    },
    openReport: vi.fn(),
    download: vi.fn(),
    now: () => new Date(2026, 10, 21),
  };
  await mountLog(panel, deps);
  return {
    panel,
    deps,
    emit: (next) => {
      emit(next);
    },
    setEnabled: (on) => {
      setEnabled(on);
    },
  };
}

function byText(panel: HTMLElement, text: string): HTMLButtonElement {
  const found = [...panel.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

const rows = (panel: HTMLElement): string[] =>
  [...panel.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent).join(' | '),
  );

describe('the "Dziennik" tab', () => {
  it('says the log is empty and offers nothing to export', async () => {
    const { panel } = await mount([]);

    expect(panel.querySelector('.log-empty')?.hasAttribute('hidden')).toBe(false);
    expect(byText(panel, 'Eksportuj CSV').disabled).toBe(true);
    expect(byText(panel, 'Raport PDF').disabled).toBe(true);
    expect(byText(panel, 'Wyczyść dziennik').disabled).toBe(true);
  });

  it('sums up the log and lists entries newest first with Polish names', async () => {
    const { panel } = await mount([
      entry(0, { source: 'manual', masked: 1, generalised: 1, categories: { PESEL: 2 } }),
      entry(1, { categories: { PERSON: 1 } }),
    ]);

    const stats = [...panel.querySelectorAll('.stat')].map((stat) => stat.textContent);
    expect(stats[0]).toBe('Maskowania2ręcznie 1, automatycznie 1');
    expect(stats[1]).toBe('Zamaskowane dane3znaczniki 2, ogólnie 1');
    const ranks = [...panel.querySelectorAll('.rank')].map((list) =>
      [...list.querySelectorAll('li')].map((li) => li.textContent),
    );
    expect(ranks).toEqual([
      ['PESEL2', 'osoba1'],
      ['chatgpt.com1', 'claude.ai1'],
    ]);
    expect(rows(panel)).toEqual([
      '2026-11-01 12:01:01 | claude.ai | automatycznie | 1 | osoba: 1',
      '2026-11-01 12:00:00 | chatgpt.com | ręcznie | 2 | PESEL: 2',
    ]);
  });

  it(`shows ${String(PAGE_SIZE)} entries and more on request`, async () => {
    const log = Array.from({ length: PAGE_SIZE + 50 }, (_, index) => entry(index));
    const { panel } = await mount(log);
    expect(panel.querySelectorAll('tbody tr')).toHaveLength(PAGE_SIZE);

    byText(panel, 'Pokaż więcej').click();

    expect(panel.querySelectorAll('tbody tr')).toHaveLength(PAGE_SIZE + 50);
    expect(byText(panel, 'Pokaż więcej').hidden).toBe(true);
  });

  it('follows changes made elsewhere', async () => {
    const { panel, emit, setEnabled } = await mount([]);

    emit([entry(0)]);
    expect(rows(panel)).toHaveLength(1);
    setEnabled(false);
    expect(panel.querySelector('.log-disabled')?.hasAttribute('hidden')).toBe(false);
  });

  it('says when logging is turned off', async () => {
    const { panel } = await mount([entry(0)], false);

    expect(panel.querySelector('.log-disabled')?.hasAttribute('hidden')).toBe(false);
  });

  it('clears only after the inline confirmation', async () => {
    const { panel, deps } = await mount([entry(0)]);

    byText(panel, 'Wyczyść dziennik').click();
    expect(panel.querySelector('.confirm')?.hasAttribute('hidden')).toBe(false);
    byText(panel, 'Anuluj').click();
    expect(deps.clear).not.toHaveBeenCalled();

    byText(panel, 'Wyczyść dziennik').click();
    byText(panel, 'Tak, wyczyść').click();
    await vi.waitFor(() => {
      expect(rows(panel)).toEqual([]);
    });
    expect(deps.clear).toHaveBeenCalledOnce();
    expect(panel.querySelector('.log-empty')?.hasAttribute('hidden')).toBe(false);
  });

  it('exports CSV and opens the printable report', async () => {
    const { panel, deps } = await mount([entry(0)]);

    byText(panel, 'Eksportuj CSV').click();
    byText(panel, 'Raport PDF').click();

    expect(deps.download).toHaveBeenCalledExactlyOnceWith(
      'ainonim-dziennik-2026-11-21.csv',
      expect.stringContaining('2026-11-01 12:00:00;chatgpt.com;automatycznie;1;0;1;osoba: 1'),
    );
    expect(deps.openReport).toHaveBeenCalledOnce();
    expect(csvFileName(new Date(2027, 0, 5))).toBe('ainonim-dziennik-2027-01-05.csv');
  });

  it('says when clearing failed and keeps the entries', async () => {
    const { panel, deps } = await mount([entry(0)]);
    vi.mocked(deps.clear).mockRejectedValueOnce(new Error('storage unavailable'));

    byText(panel, 'Wyczyść dziennik').click();
    byText(panel, 'Tak, wyczyść').click();

    await vi.waitFor(() => {
      expect(panel.querySelector('.log-error')?.textContent).toBe(
        'Nie udało się wyczyścić dziennika.',
      );
    });
    expect(panel.querySelector('.log-error')?.hasAttribute('hidden')).toBe(false);
    expect(rows(panel)).toHaveLength(1);
    expect(byText(panel, 'Tak, wyczyść').disabled).toBe(false);
  });
});

describe('the "Dziennik" tab in the browser', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  async function mountWithBrowser(): Promise<HTMLElement> {
    const panel = document.createElement('section');
    document.body.replaceChildren(panel);
    await mountLog(panel, {
      read: () => Promise.resolve([entry(0)]),
      onChange: () => () => undefined,
      now: () => new Date(2026, 10, 21),
    });
    return panel;
  }

  it('opens the printable report in a new tab', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create').mockResolvedValue({} as never);
    const panel = await mountWithBrowser();

    byText(panel, 'Raport PDF').click();

    expect(create).toHaveBeenCalledExactlyOnceWith({
      url: fakeBrowser.runtime.getURL(REPORT_PATH),
    });
  });

  it('saves the CSV as a download and releases the file afterwards', async () => {
    vi.useFakeTimers();
    try {
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
      const downloads: { href: string; download: string }[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        downloads.push({ href: this.href, download: this.download });
      });
      const panel = await mountWithBrowser();

      byText(panel, 'Eksportuj CSV').click();

      expect(downloads).toEqual([
        { href: 'blob:csv', download: 'ainonim-dziennik-2026-11-21.csv' },
      ]);
      const blob = createUrl.mock.calls[0]?.[0] as Blob;
      expect(blob.type).toBe('text/csv;charset=utf-8');
      expect(await blob.text()).toContain('chatgpt.com');
      expect(revoke).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:csv');
    } finally {
      vi.useRealTimers();
    }
  });
});
