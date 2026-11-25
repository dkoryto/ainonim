// The panel's fixed parts (header, notes, buttons) and how a badge state shows in them and in the
// icon. The list of values in it is lib/content/ui/badge-list.ts.

import type { BadgeNotice, BadgeState, BadgeStatus } from './badge-types';
import { element, makeButton } from './badge-dom';
import type { FieldIcon, IconState } from './icon';

export interface PanelView {
  panel: HTMLDivElement;
  count: HTMLSpanElement;
  note: HTMLParagraphElement;
  noticeLine: HTMLParagraphElement;
  list: HTMLUListElement;
  maskButton: HTMLButtonElement;
  revertButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
}

/** What the state shows besides itself: the rows listed, how many are checked, the panel open. */
export interface PanelCounts {
  rows: number;
  checked: number;
  open: boolean;
}

const NOTES: Readonly<Record<BadgeStatus, string>> = {
  idle: '',
  analysing: 'Trwa analiza…',
  done: 'Nie znaleziono danych osobowych.',
  failed: 'Analiza nie powiodła się.',
};

/** The line about sending shown at the top of the panel and in the icon's title. */
export function noticeText(notice: BadgeNotice): string {
  if (notice.kind === 'auto-masked') {
    return `Zamaskowano automatycznie (${String(notice.count)}). „Cofnij” przywraca tekst.`;
  }
  const seconds = String(Math.round(notice.retryMs / 1000));
  return (
    'Nie wysłano: nie udało się zamaskować danych (analiza nie powiodła się albo trwała ' +
    'za długo). ' +
    `Wyślij ponownie w ciągu ${seconds} s, aby wysłać tekst bez maskowania.`
  );
}

function iconStateOf(status: BadgeStatus, rows: number, notice?: BadgeNotice): IconState {
  if (status === 'done' && rows > 0) return { kind: 'found', count: rows };
  // The masked text is analysed again after the write; meanwhile the icon tells what happened.
  if (notice?.kind === 'auto-masked') return { kind: 'masked', count: notice.count };
  if (notice?.kind === 'send-blocked') return { kind: 'failed' };
  if (status === 'done') return { kind: 'clear' };
  return { kind: status === 'failed' ? 'failed' : 'analysing' };
}

export function buildPanel(): PanelView {
  const panel = element('div', 'panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'AInonim: znalezione dane osobowe');

  const head = element('div', 'head');
  const count = element('span', 'count');
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  head.append(element('span', 'title', 'AInonim'), count);

  const note = element('p', 'note');
  const noticeLine = element('p', 'notice');
  noticeLine.setAttribute('role', 'status');
  noticeLine.hidden = true;
  const list = element('ul', 'list');

  const actions = element('div', 'actions');
  const maskButton = makeButton('mask', '', 'Zamaskuj zaznaczone dane osobowe w tym polu');
  const revertButton = makeButton('revert', 'Cofnij', 'Cofnij ostatnie maskowanie w tym polu');
  const closeButton = makeButton('close', '×', 'Zamknij panel AInonim');
  actions.append(maskButton, revertButton, closeButton);

  panel.append(head, noticeLine, note, list, actions);
  return { panel, count, note, noticeLine, list, maskButton, revertButton, closeButton };
}

/** Show `state` in the panel's fixed parts and in the icon. */
export function renderState(
  view: PanelView,
  icon: FieldIcon,
  state: BadgeState,
  { rows, checked, open }: PanelCounts,
): void {
  view.maskButton.disabled = checked === 0 || state.status !== 'done';
  view.maskButton.textContent = `Zamaskuj zaznaczone (${String(checked)})`;
  view.revertButton.hidden = state.revert === 'none';
  view.revertButton.disabled = state.revert !== 'ready';
  view.revertButton.title =
    state.revert === 'stale' ? 'Tekst w polu zmienił się od maskowania' : 'Przywróć tekst';
  view.count.textContent = String(rows);
  view.list.hidden = rows === 0;
  view.note.hidden = rows > 0;
  view.note.textContent = NOTES[state.status];
  const notice = state.notice ? noticeText(state.notice) : '';
  view.noticeLine.hidden = notice === '';
  view.noticeLine.textContent = notice;
  view.noticeLine.classList.toggle('blocked', state.notice?.kind === 'send-blocked');
  // The masked icon already names the automatic masking; a held-back send needs the whole note.
  icon.set(
    iconStateOf(state.status, rows, state.notice),
    state.notice?.kind === 'send-blocked' ? notice : undefined,
  );
  icon.button.setAttribute('aria-expanded', String(open));
}
