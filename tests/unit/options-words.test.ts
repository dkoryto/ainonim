// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { MAX_CUSTOM_WORDS, getCustomWords, setCustomWords } from '~/lib/settings';
import { EXPORT_FORMAT, exportWords, importWords, mountWords } from '~/lib/ui/options/words';

const word = (value: string) => ({ value, regex: false });

function inputs(panel: HTMLElement): HTMLInputElement[] {
  return [...panel.querySelectorAll<HTMLInputElement>('input.word-input')];
}

function buttonNamed(panel: HTMLElement, text: string): HTMLButtonElement {
  const found = [...panel.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const status = (panel: HTMLElement) => panel.querySelector('.status')?.textContent ?? '';

let panel: HTMLElement;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '<section id="panel"></section>';
  panel = document.getElementById('panel') as HTMLElement;
});

describe('importWords / exportWords', () => {
  it('reads back what it exported', () => {
    const words = [word('Feniks'), { value: 'KS-\\d+', regex: true }];
    const result = importWords(exportWords(words), []);

    expect(result).toEqual({ ok: true, words, added: 2, skipped: 0 });
    expect(JSON.parse(exportWords(words))).toEqual({ format: EXPORT_FORMAT, version: 1, words });
  });

  it('skips duplicates and malformed entries and counts them', () => {
    const file = JSON.stringify({
      format: EXPORT_FORMAT,
      version: 1,
      words: [word('FENIKS'), word('Orzeł'), { value: '' }, 7, word('orzeł')],
    });

    expect(importWords(file, [word('Feniks')])).toEqual({
      ok: true,
      words: [word('Feniks'), word('Orzeł')],
      added: 1,
      skipped: 4,
    });
  });

  it('stops at the entry limit', () => {
    const existing = Array.from({ length: MAX_CUSTOM_WORDS - 1 }, (_, i) => word(`w${String(i)}`));
    const file = exportWords([word('a'), word('b')]);

    expect(importWords(file, existing)).toMatchObject({ ok: true, added: 1, skipped: 1 });
  });

  it.each([
    ['not json', 'To nie jest plik JSON.'],
    ['{"words": []}', 'To nie jest plik z listą własnych słów AInonim.'],
    ['[]', 'To nie jest plik z listą własnych słów AInonim.'],
    [
      `{"format": "${EXPORT_FORMAT}", "version": 2, "words": []}`,
      'Ta wersja pliku nie jest obsługiwana.',
    ],
  ])('refuses %s', (json, error) => {
    expect(importWords(json, [])).toEqual({ ok: false, error });
  });
});

describe('mountWords', () => {
  it('lists the stored words and saves a new one', async () => {
    await setCustomWords([word('Feniks')]);
    await mountWords(panel);
    expect(inputs(panel).map((input) => input.value)).toEqual(['Feniks']);

    buttonNamed(panel, '+ Dodaj słowo').click();
    const added = inputs(panel)[1];
    if (!added) throw new Error('no new row');
    expect(document.activeElement).toBe(added);
    type(added, 'KS-\\d+');
    await flush();

    expect(await getCustomWords()).toEqual([word('Feniks'), { value: 'KS-\\d+', regex: true }]);
    expect(added.parentElement?.querySelector('.word-kind')?.textContent).toBe('wzorzec');
  });

  it('marks an invalid regex but keeps it on the list', async () => {
    await mountWords(panel);
    buttonNamed(panel, '+ Dodaj słowo').click();
    const input = inputs(panel)[0];
    if (!input) throw new Error('no row');

    type(input, '(a+)+');
    await flush();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.parentElement?.querySelector('.word-problem')?.textContent).toContain('wolno');
    expect(await getCustomWords()).toEqual([{ value: '(a+)+', regex: true }]);
  });

  it('deletes one entry with its bin button', async () => {
    await setCustomWords([word('a'), word('b')]);
    await mountWords(panel);

    const remove = panel.querySelectorAll<HTMLButtonElement>('button.word-delete')[0];
    remove?.click();
    await flush();

    expect(await getCustomWords()).toEqual([word('b')]);
  });

  it('offers "Usuń wszystkie" from four entries on, after a confirmation', async () => {
    await setCustomWords([word('a'), word('b'), word('c')]);
    await mountWords(panel);
    const clearAll = buttonNamed(panel, 'Usuń wszystkie');
    expect(clearAll.hidden).toBe(true);

    buttonNamed(panel, '+ Dodaj słowo').click();
    const fourth = inputs(panel)[3];
    if (fourth) type(fourth, 'd');
    await flush();
    expect(clearAll.hidden).toBe(false);

    clearAll.click();
    expect(panel.querySelector('.confirm')?.textContent).toContain('(4)');
    buttonNamed(panel, 'Anuluj').click();
    expect(inputs(panel)).toHaveLength(4);

    clearAll.click();
    buttonNamed(panel, 'Usuń').click();
    await flush();
    expect(inputs(panel)).toHaveLength(0);
    expect(await getCustomWords()).toEqual([]);
  });

  it('shows an error when the list does not fit into storage.sync', async () => {
    await mountWords(panel);
    for (let i = 0; i < 60; i++) buttonNamed(panel, '+ Dodaj słowo').click();
    inputs(panel).forEach((input, i) => {
      input.value = `${'ż'.repeat(100)}${String(i)}`;
    });
    inputs(panel)[0]?.dispatchEvent(new Event('change'));
    await flush();

    expect(status(panel)).toContain('za duża');
    expect(await getCustomWords()).toEqual([]);
  });

  it('imports a file and reports what was added and skipped', async () => {
    await setCustomWords([word('Feniks')]);
    await mountWords(panel);
    const file = new File([exportWords([word('feniks'), word('Orzeł')])], 'slowa.json', {
      type: 'application/json',
    });
    const fileInput = panel.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('no file input');
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });

    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => {
      expect(status(panel)).toContain('Dodano: 1, pominięto: 1');
    });

    expect(await getCustomWords()).toEqual([word('Feniks'), word('Orzeł')]);
    expect(inputs(panel).map((input) => input.value)).toEqual(['Feniks', 'Orzeł']);
  });

  it('exports the list as a JSON download', async () => {
    await setCustomWords([word('Feniks')]);
    await mountWords(panel);
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob;
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    buttonNamed(panel, 'Eksportuj').click();

    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(JSON.parse((await blob?.text()) ?? '')).toMatchObject({ words: [word('Feniks')] });
    vi.restoreAllMocks();
  });

  it('redraws when the list changes elsewhere', async () => {
    await mountWords(panel);

    await setCustomWords([word('Orzeł')]);

    expect(inputs(panel).map((input) => input.value)).toEqual(['Orzeł']);
  });
});
