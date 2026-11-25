// Tab "Własne słowa": the user's own words and patterns to mask. The service worker finds them in
// every analysed text (lib/shared/custom-words.ts) and masks them as `<SLOWO_n>`.
//
// The list is user data: it is kept in storage.sync only, and export writes a local file.
import { PROBLEM_TEXT, checkCustomWord } from '~/lib/shared/custom-words';
import {
  type CustomWord,
  CustomWordsTooLargeError,
  MAX_CUSTOM_WORDS,
  MAX_CUSTOM_WORD_LENGTH,
  SYNC_ITEM_QUOTA_BYTES,
  customWordKey,
  getCustomWords,
  looksLikeRegex,
  onCustomWordsChange,
  parseCustomWord,
  setCustomWords,
} from '~/lib/settings';
import { button } from '~/lib/pages/controls';
import { heading, make } from './dom';

export const EXPORT_FORMAT = 'ainonim-custom-words';
export const EXPORT_VERSION = 1;
export const EXPORT_FILE_NAME = 'ainonim-wlasne-slowa.json';
/** "Usuń wszystkie" is offered from this many entries on; fewer are quick to delete one by one. */
const CLEAR_ALL_FROM = 4;

export function exportWords(words: readonly CustomWord[]): string {
  const data = { format: EXPORT_FORMAT, version: EXPORT_VERSION, words };
  return `${JSON.stringify(data, null, 2)}\n`;
}

export type ImportResult =
  { ok: true; words: CustomWord[]; added: number; skipped: number } | { ok: false; error: string };

/**
 * `existing` with the entries of an exported file added. Entries that are malformed, already on
 * the list or beyond MAX_CUSTOM_WORDS are skipped and counted.
 */
export function importWords(json: string, existing: readonly CustomWord[]): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'To nie jest plik JSON.' };
  }
  const file = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  if (file.format !== EXPORT_FORMAT || !Array.isArray(file.words)) {
    return { ok: false, error: 'To nie jest plik z listą własnych słów AInonim.' };
  }
  if (file.version !== EXPORT_VERSION) {
    return { ok: false, error: 'Ta wersja pliku nie jest obsługiwana.' };
  }
  const words = [...existing];
  const seen = new Set(words.map(customWordKey));
  let added = 0;
  for (const item of file.words) {
    const word = parseCustomWord(item);
    if (!word || seen.has(customWordKey(word)) || words.length >= MAX_CUSTOM_WORDS) continue;
    seen.add(customWordKey(word));
    words.push(word);
    added++;
  }
  return { ok: true, words, added, skipped: file.words.length - added };
}

function saveError(error: unknown): string {
  if (error instanceof CustomWordsTooLargeError) {
    const kb = String(SYNC_ITEM_QUOTA_BYTES / 1024);
    return `Lista jest za duża, by ją zapisać (limit synchronizacji to ${kb} KB). Usuń lub skróć część wpisów.`;
  }
  return 'Nie udało się zapisać listy.';
}

const SVG = 'http://www.w3.org/2000/svg';

function binIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M6 1h4l1 1h3v2H2V2h3l1-1zM3 5h10l-1 10H4L3 5zm3 2v6h1V7H6zm3 0v6h1V7H9z');
  svg.append(path);
  return svg;
}

/** The fixed parts of the tab, drawn once; the rows of `list` come and go. */
interface WordsUi {
  list: HTMLUListElement;
  status: HTMLElement;
  add: HTMLButtonElement;
  clearAll: HTMLButtonElement;
  confirm: HTMLElement;
  confirmText: HTMLElement;
  confirmYes: HTMLButtonElement;
  confirmNo: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
}

function wordsUi(doc: Document): WordsUi {
  const status = make(doc, 'p', 'status');
  status.setAttribute('role', 'status');
  const confirm = make(doc, 'span', 'confirm');
  const confirmText = make(doc, 'span');
  const confirmYes = button(doc, 'Usuń', 'danger');
  const confirmNo = button(doc, 'Anuluj');
  confirm.append(confirmText, confirmYes, confirmNo);
  confirm.hidden = true;
  const fileInput = make(doc, 'input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  return {
    list: make(doc, 'ul', 'words'),
    status,
    add: button(doc, '+ Dodaj słowo'),
    clearAll: button(doc, 'Usuń wszystkie', 'danger-outline'),
    confirm,
    confirmText,
    confirmYes,
    confirmNo,
    exportButton: button(doc, 'Eksportuj'),
    importButton: button(doc, 'Importuj'),
    fileInput,
  };
}

/** The entries as typed, blank rows left out. */
function collectWords(list: HTMLElement): CustomWord[] {
  return [...list.querySelectorAll<HTMLInputElement>('input.word-input')].flatMap((input) => {
    const value = input.value.trim();
    return value === '' ? [] : [{ value, regex: input.dataset.regex === 'true' }];
  });
}

/** Shows next to an entry whether it is a word or a pattern, and why it is skipped if it is. */
function describeRow(row: HTMLElement, input: HTMLInputElement): void {
  const value = input.value.trim();
  const kind = row.querySelector('.word-kind');
  const problem = row.querySelector('.word-problem');
  if (!kind || !problem) return;
  if (value === '') {
    kind.textContent = '';
    problem.textContent = '';
    input.removeAttribute('aria-invalid');
    return;
  }
  const regex = input.dataset.regex === 'true';
  kind.textContent = regex ? 'wzorzec' : 'słowo';
  const checked = checkCustomWord({ value, regex });
  problem.textContent = checked.ok ? '' : `${PROBLEM_TEXT[checked.problem]} – wpis jest pomijany.`;
  if (checked.ok) input.removeAttribute('aria-invalid');
  else input.setAttribute('aria-invalid', 'true');
}

function wordRow(
  doc: Document,
  word: CustomWord | null,
): { row: HTMLLIElement; input: HTMLInputElement; remove: HTMLButtonElement } {
  const row = make(doc, 'li', 'word-row');
  const input = make(doc, 'input', 'word-input');
  input.type = 'text';
  input.maxLength = MAX_CUSTOM_WORD_LENGTH;
  input.value = word?.value ?? '';
  input.dataset.regex = String(word?.regex ?? false);
  input.setAttribute('aria-label', 'Słowo, fraza lub wyrażenie regularne');
  input.placeholder = 'np. Projekt Feniks albo KS-\\d+/\\d+';
  const remove = button(doc, '', 'word-delete');
  remove.append(binIcon(doc));
  remove.setAttribute('aria-label', 'Usuń wpis');
  remove.title = 'Usuń wpis';
  row.append(input, make(doc, 'span', 'word-kind'), remove, make(doc, 'span', 'word-problem'));
  return { row, input, remove };
}

function refreshControls(ui: WordsUi): void {
  const count = ui.list.children.length;
  ui.add.disabled = count >= MAX_CUSTOM_WORDS;
  ui.clearAll.hidden = count < CLEAR_ALL_FROM || !ui.confirm.hidden;
  if (count < CLEAR_ALL_FROM) ui.confirm.hidden = true;
}

function downloadWords(doc: Document, words: readonly CustomWord[]): void {
  const blob = new Blob([exportWords(words)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = make(doc, 'a');
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Wires the rows and the list buttons ("+ Dodaj słowo", "Usuń wszystkie"); `save` is called when
 * the list changes. Returns the function that redraws the rows.
 */
function wireList(ui: WordsUi, save: () => Promise<void>): (words: readonly CustomWord[]) => void {
  const doc = ui.list.ownerDocument;
  const addRow = (word: CustomWord | null): HTMLInputElement => {
    const { row, input, remove } = wordRow(doc, word);
    input.addEventListener('input', () => {
      // Typing decides the kind again; an imported plain entry like "C++" keeps its flag until edited.
      input.dataset.regex = String(looksLikeRegex(input.value));
      describeRow(row, input);
    });
    input.addEventListener('change', () => {
      void save();
    });
    remove.addEventListener('click', () => {
      const wasBlank = input.value.trim() === '';
      row.remove();
      refreshControls(ui);
      if (!wasBlank) void save();
    });
    ui.list.append(row);
    describeRow(row, input);
    return input;
  };
  const showWords = (words: readonly CustomWord[]): void => {
    ui.list.replaceChildren();
    for (const word of words) addRow(word);
    refreshControls(ui);
  };

  ui.add.addEventListener('click', () => {
    addRow(null).focus();
    refreshControls(ui);
  });
  ui.clearAll.addEventListener('click', () => {
    ui.confirmText.textContent = `Usunąć wszystkie wpisy (${String(ui.list.children.length)})?`;
    ui.confirm.hidden = false;
    refreshControls(ui);
    ui.confirmNo.focus();
  });
  ui.confirmNo.addEventListener('click', () => {
    ui.confirm.hidden = true;
    refreshControls(ui);
  });
  ui.confirmYes.addEventListener('click', () => {
    ui.confirm.hidden = true;
    showWords([]);
    void save();
  });
  return showWords;
}

/** Wires "Eksportuj" and "Importuj"; an import is merged into the list and saved. */
function wireFiles(
  ui: WordsUi,
  showWords: (words: readonly CustomWord[]) => void,
  save: () => Promise<void>,
): void {
  const { status, fileInput } = ui;
  ui.exportButton.addEventListener('click', () => {
    downloadWords(ui.list.ownerDocument, collectWords(ui.list));
  });
  ui.importButton.addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file.text().then(async (text) => {
      const result = importWords(text, collectWords(ui.list));
      if (!result.ok) {
        status.textContent = `Nie zaimportowano: ${result.error}`;
        return;
      }
      showWords(result.words);
      await save();
      if (status.textContent === '') {
        status.textContent = `Zaimportowano. Dodano: ${String(result.added)}, pominięto: ${String(result.skipped)} (duplikaty lub nieprawidłowe wpisy).`;
      }
    });
  });
}

export async function mountWords(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  const ui = wordsUi(doc);

  // What this page wrote last, so its own change notification does not redraw the rows.
  let saved = '';
  const save = async (): Promise<void> => {
    const words = collectWords(ui.list);
    saved = JSON.stringify(words);
    try {
      await setCustomWords(words);
      ui.status.textContent = '';
    } catch (error) {
      ui.status.textContent = saveError(error);
    }
  };
  const showWords = wireList(ui, save);
  wireFiles(ui, showWords, save);

  onCustomWordsChange((words) => {
    // Another options tab or a sync from another device changed the list.
    if (JSON.stringify(words) !== saved) showWords(words);
  });
  const words = await getCustomWords().catch(() => []);
  saved = JSON.stringify(words);
  showWords(words);

  const listActions = make(doc, 'div', 'actions');
  listActions.append(ui.add, ui.clearAll, ui.confirm);
  const fileActions = make(doc, 'div', 'actions');
  fileActions.append(ui.exportButton, ui.importButton, ui.fileInput);

  panel.replaceChildren(
    ...heading(
      doc,
      'Własne słowa',
      'Słowa i frazy, które AInonim ma zawsze maskować, np. nazwy projektów czy klientów. ' +
        'Zwykły wpis pasuje jako całe słowo, bez względu na wielkość liter. Wpis z jednym ze ' +
        'znaków [ ] \\ + * ? { } ( ) | ^ $ jest wyrażeniem regularnym. W tekście stają się ' +
        'znacznikami <SLOWO_1>, <SLOWO_2>… Lista jest przechowywana w ustawieniach przeglądarki ' +
        '(synchronizowanych z jej kontem) i nigdzie indziej nie trafia.',
    ),
    ui.list,
    listActions,
    fileActions,
    ui.status,
  );
}
