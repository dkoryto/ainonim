// The printable report of the masking log, opened from the "Dziennik" tab. It draws the summary,
// the breakdown by kind of data and by site and the recent maskings, then opens the print dialog,
// where the user can save it as PDF. No PDF library: the browser's own printing does it.
import { formatDateTime } from '~/lib/log/csv';
import { summarize } from '~/lib/log/entries';
import { readLog } from '~/lib/log/store';
import { categoryName, entriesTable, rankList, summaryStats } from '~/lib/ui/log-view';
import { make } from '~/lib/ui/options/dom';

/** Entries listed under "Ostatnie maskowania"; the figures above cover the whole log. */
const RECENT = 50;

async function render(root: HTMLElement): Promise<void> {
  const doc = root.ownerDocument;
  const log = await readLog();
  const summary = summarize(log);
  const header = make(doc, 'header', 'report-header');
  header.append(
    make(doc, 'h1', undefined, 'AInonim – raport maskowania danych osobowych'),
    make(doc, 'p', 'muted', `Wygenerowano: ${formatDateTime(Date.now())}`),
    make(
      doc,
      'p',
      'muted',
      'Raport zawiera wyłącznie metadane: czas, stronę i liczbę zamaskowanych danych według ' +
        'kategorii. Nie zawiera treści wiadomości ani samych danych.',
    ),
  );
  root.replaceChildren(header);
  if (log.length === 0) {
    root.append(make(doc, 'p', undefined, 'Dziennik jest pusty.'));
    return;
  }
  const breakdown = make(doc, 'div', 'breakdown');
  breakdown.append(
    rankList(doc, 'Kategorie danych (liczba wartości)', summary.categories, categoryName),
    rankList(doc, 'Strony (liczba maskowań)', summary.sites, (host) => host),
  );
  const recent = make(doc, 'section', 'recent');
  const shown = log.slice(-RECENT).reverse();
  recent.append(
    make(
      doc,
      'h2',
      undefined,
      log.length > RECENT
        ? `Ostatnie maskowania (${String(RECENT)} z ${String(log.length)})`
        : 'Maskowania',
    ),
    entriesTable(doc, shown),
  );
  root.append(
    make(doc, 'h2', undefined, 'Podsumowanie'),
    summaryStats(doc, summary),
    breakdown,
    recent,
  );
}

const root = document.getElementById('report');
if (root) {
  void render(root)
    .catch(() => {
      root.textContent = 'Nie udało się odczytać dziennika.';
    })
    .finally(() => {
      root.removeAttribute('aria-busy');
      // After layout, so the print preview has the whole report.
      requestAnimationFrame(() => {
        window.print();
      });
    });
}
