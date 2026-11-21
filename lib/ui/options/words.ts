// Tab "Własne słowa": the user's own words and patterns to mask. The service worker finds them in
// every analysed text (lib/detection/custom-words.ts) and masks them as `<SLOWO_n>`.
//
// The list is user data: it is kept in storage.sync only, and export writes a local file.
import { PROBLEM_TEXT, checkCustomWord } from '~/lib/detection/custom-words';
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

function button(doc: Document, text: string, className?: string): HTMLButtonElement {
  const element = make(doc, 'button', className, text);
  element.type = 'button';
  return element;
}

export async function mountWords(panel: HTMLElement): Promise<void> {
  const doc = panel.ownerDocument;
  const list = make(doc, 'ul', 'words');
  const status = make(doc, 'p', 'status');
  status.setAttribute('role', 'status');
  const add = button(doc, '+ Dodaj słowo');
  const clearAll = button(doc, 'Usuń wszystkie', 'danger-outline');
  const confirm = make(doc, 'span', 'confirm');
  const confirmText = make(doc, 'span');
  const confirmYes = button(doc, 'Usuń', 'danger');
  const confirmNo = button(doc, 'Anuluj');
  confirm.append(confirmText, confirmYes, confirmNo);
  confirm.hidden = true;
  const exportButton = button(doc, 'Eksportuj');
  const importButton = button(doc, 'Importuj');
  const fileInput = make(doc, 'input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;

  /** The entries as typed, blank rows left out. */
  const collect = (): CustomWord[] =>
    [...list.querySelectorAll<HTMLInputElement>('input.word-input')].flatMap((input) => {
      const value = input.value.trim();
      return value === '' ? [] : [{ value, regex: input.dataset.regex === 'true' }];
    });

  // What this page wrote last, so its own change notification does not redraw the rows.
  let saved = '';
  const save = async (): Promise<void> => {
    const words = collect();
    saved = JSON.stringify(words);
    try {
      await setCustomWords(words);
      status.textContent = '';
    } catch (error) {
      status.textContent = saveError(error);
    }
  };

  const refreshControls = (): void => {
    const count = list.children.length;
    add.disabled = count >= MAX_CUSTOM_WORDS;
    clearAll.hidden = count < CLEAR_ALL_FROM || !confirm.hidden;
    if (count < CLEAR_ALL_FROM) confirm.hidden = true;
  };

  const describe = (row: HTMLElement, input: HTMLInputElement): void => {
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
    problem.textContent = checked.ok
      ? ''
      : `${PROBLEM_TEXT[checked.problem]} – wpis jest pomijany.`;
    if (checked.ok) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
  };

  const addRow = (word: CustomWord | null): HTMLInputElement => {
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

    input.addEventListener('input', () => {
      // Typing decides the kind again; an imported plain entry like "C++" keeps its flag until edited.
      input.dataset.regex = String(looksLikeRegex(input.value));
      describe(row, input);
    });
    input.addEventListener('change', () => {
      void save();
    });
    remove.addEventListener('click', () => {
      const wasBlank = input.value.trim() === '';
      row.remove();
      refreshControls();
      if (!wasBlank) void save();
    });
    list.append(row);
    describe(row, input);
    return input;
  };

  const showWords = (words: readonly CustomWord[]): void => {
    list.replaceChildren();
    for (const word of words) addRow(word);
    refreshControls();
  };

  add.addEventListener('click', () => {
    addRow(null).focus();
    refreshControls();
  });

  clearAll.addEventListener('click', () => {
    confirmText.textContent = `Usunąć wszystkie wpisy (${String(list.children.length)})?`;
    confirm.hidden = false;
    refreshControls();
    confirmNo.focus();
  });
  confirmNo.addEventListener('click', () => {
    confirm.hidden = true;
    refreshControls();
  });
  confirmYes.addEventListener('click', () => {
    confirm.hidden = true;
    showWords([]);
    void save();
  });

  exportButton.addEventListener('click', () => {
    const blob = new Blob([exportWords(collect())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = make(doc, 'a');
    link.href = url;
    link.download = EXPORT_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  });

  importButton.addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file.text().then(async (text) => {
      const result = importWords(text, collect());
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

  onCustomWordsChange((words) => {
    // Another options tab or a sync from another device changed the list.
    if (JSON.stringify(words) !== saved) showWords(words);
  });
  const words = await getCustomWords().catch(() => []);
  saved = JSON.stringify(words);
  showWords(words);

  const listActions = make(doc, 'div', 'actions');
  listActions.append(add, clearAll, confirm);
  const fileActions = make(doc, 'div', 'actions');
  fileActions.append(exportButton, importButton, fileInput);

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
    list,
    listActions,
    fileActions,
    status,
  );
}
