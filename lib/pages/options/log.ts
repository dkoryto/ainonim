// Tab "Dziennik": the log of maskings, metadata only (lib/log/). A summary, the most masked
// kinds of data and the sites, the latest entries, and export as CSV or a printable report.
import { browser } from 'wxt/browser';
import { toCsv } from '~/lib/log/csv';
import { type LogEntry, summarize } from '~/lib/shared/log-entries';
import { clearLog, onLogChange, readLog } from '~/lib/log/store';
import { getLogEnabled, onLogEnabledChange } from '~/lib/settings';
import { categoryName, entriesTable, rankList, summaryStats } from '~/lib/pages/log-view';
import { type ConfirmPrompt, button, confirmPrompt } from '~/lib/pages/controls';
import { heading, make } from './dom';

/** Rows of the table shown at first and added by each "Pokaż więcej". */
export const PAGE_SIZE = 200;
const TOP_CATEGORIES = 8;

export const REPORT_PATH = '/report.html';

/** `ainonim-dziennik-2026-11-21.csv` */
export function csvFileName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `ainonim-dziennik-${day}.csv`;
}

function saveFile(doc: Document, name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = make(doc, 'a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/** Storage, settings and browser calls of the tab, replaceable in tests. */
export interface LogTabDeps {
  read: () => Promise<LogEntry[]>;
  clear: () => Promise<void>;
  onChange: (callback: (log: LogEntry[]) => void) => () => void;
  isEnabled: () => Promise<boolean>;
  onEnabledChange: (callback: (enabled: boolean) => void) => () => void;
  openReport: () => void;
  download: (name: string, text: string) => void;
  now: () => Date;
}

function defaultDeps(doc: Document): LogTabDeps {
  return {
    read: readLog,
    clear: clearLog,
    onChange: onLogChange,
    isEnabled: getLogEnabled,
    onEnabledChange: onLogEnabledChange,
    openReport: () => {
      void browser.tabs.create({ url: browser.runtime.getURL(REPORT_PATH) });
    },
    download: (name, text) => {
      saveFile(doc, name, text);
    },
    now: () => new Date(),
  };
}

/** The parts of the tab that change after it is drawn. */
interface LogUi {
  disabledNote: HTMLElement;
  empty: HTMLElement;
  summary: HTMLElement;
  breakdown: HTMLElement;
  exportCsv: HTMLButtonElement;
  report: HTMLButtonElement;
  clear: HTMLButtonElement;
  confirm: ConfirmPrompt;
  error: HTMLElement;
  recent: HTMLElement;
  tableWrap: HTMLElement;
  more: HTMLButtonElement;
}

/** Draws the tab into `panel`, everything but the heading empty until the log is rendered. */
function drawLogTab(panel: HTMLElement): LogUi {
  const doc = panel.ownerDocument;
  const disabledNote = make(
    doc,
    'p',
    'log-note log-disabled',
    'Zapisywanie dziennika jest wyłączone (zakładka „Ogólne”). Nowe maskowania nie są zapisywane.',
  );
  disabledNote.hidden = true;
  const empty = make(doc, 'p', 'log-note log-empty', 'Dziennik jest pusty.');
  const summary = make(doc, 'div', 'log-summary');
  const breakdown = make(doc, 'div', 'log-breakdown');

  const exportCsv = button(doc, 'Eksportuj CSV');
  const report = button(doc, 'Raport PDF');
  report.title = 'Otwiera raport do wydruku; w oknie drukowania wybierz „Zapisz jako PDF”.';
  const clear = button(doc, 'Wyczyść dziennik', 'danger-outline');
  const confirm = confirmPrompt(doc, clear, {
    question: 'Usunąć wszystkie wpisy dziennika?',
    yes: 'Tak, wyczyść',
    yesClass: 'danger',
  });
  const actions = make(doc, 'div', 'log-actions');
  actions.append(exportCsv, report, clear, confirm.box);
  const error = make(doc, 'p', 'log-note log-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const recent = make(doc, 'section', 'log-recent');
  const tableWrap = make(doc, 'div', 'log-table-wrap');
  const more = button(doc, 'Pokaż więcej', 'log-more');
  recent.append(make(doc, 'h3', undefined, 'Ostatnie maskowania'), tableWrap, more);

  panel.replaceChildren(
    ...heading(
      doc,
      'Dziennik maskowania',
      'Kiedy, na jakiej stronie i ile danych jakiego rodzaju zamaskowano, ręcznie albo ' +
        'automatycznie. Dziennik nie zawiera treści ani samych danych i zostaje na tym komputerze.',
    ),
    disabledNote,
    empty,
    summary,
    breakdown,
    actions,
    error,
    recent,
  );
  return {
    disabledNote,
    empty,
    summary,
    breakdown,
    exportCsv,
    report,
    clear,
    confirm,
    error,
    recent,
    tableWrap,
    more,
  };
}

/** Shows `log`, the table limited to its latest `shown` entries. */
function renderLog(ui: LogUi, log: readonly LogEntry[], shown: number): void {
  const doc = ui.summary.ownerDocument;
  const hasEntries = log.length > 0;
  ui.empty.hidden = hasEntries;
  for (const part of [ui.summary, ui.breakdown, ui.recent]) part.hidden = !hasEntries;
  ui.exportCsv.disabled = !hasEntries;
  ui.report.disabled = !hasEntries;
  ui.clear.disabled = !hasEntries;
  if (!hasEntries) {
    ui.confirm.box.hidden = true;
    ui.clear.hidden = false;
    for (const part of [ui.summary, ui.breakdown, ui.tableWrap]) part.replaceChildren();
    return;
  }
  const totals = summarize(log);
  ui.summary.replaceChildren(summaryStats(doc, totals));
  ui.breakdown.replaceChildren(
    rankList(doc, 'Najczęstsze kategorie', totals.categories, categoryName, TOP_CATEGORIES),
    rankList(doc, 'Strony (liczba maskowań)', totals.sites, (host) => host),
  );
  ui.tableWrap.replaceChildren(entriesTable(doc, log.slice(-shown).reverse()));
  ui.more.hidden = log.length <= shown;
}

export async function mountLog(panel: HTMLElement, deps?: Partial<LogTabDeps>): Promise<void> {
  const use: LogTabDeps = { ...defaultDeps(panel.ownerDocument), ...deps };
  const ui = drawLogTab(panel);
  const { yes } = ui.confirm;

  let log: LogEntry[] = [];
  let shown = PAGE_SIZE;
  const render = (): void => {
    renderLog(ui, log, shown);
  };

  ui.more.addEventListener('click', () => {
    shown += PAGE_SIZE;
    render();
  });
  ui.exportCsv.addEventListener('click', () => {
    use.download(csvFileName(use.now()), toCsv(log));
  });
  ui.report.addEventListener('click', () => {
    use.openReport();
  });
  yes.addEventListener('click', () => {
    yes.disabled = true;
    ui.error.hidden = true;
    use
      .clear()
      .then(() => {
        log = [];
        render();
      })
      .catch(() => {
        ui.error.textContent = 'Nie udało się wyczyścić dziennika.';
        ui.error.hidden = false;
      })
      .finally(() => {
        yes.disabled = false;
      });
  });

  // Live: maskings in other tabs and a clear from another window show up at once.
  use.onChange((next) => {
    log = next;
    render();
  });
  use.onEnabledChange((enabled) => {
    ui.disabledNote.hidden = enabled;
  });
  const [stored, enabled] = await Promise.all([use.read(), use.isEnabled().catch(() => true)]);
  log = stored;
  ui.disabledNote.hidden = enabled;
  render();
}
