import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CUSTOM_WORDS_KEY,
  CustomWordsTooLargeError,
  DISABLED_CATEGORIES_KEY,
  MAX_CUSTOM_WORDS,
  MAX_CUSTOM_WORD_LENGTH,
  getCustomWords,
  getDetectionSettings,
  getDisabledCategories,
  looksLikeRegex,
  onCustomWordsChange,
  onDisabledCategoriesChange,
  parseCustomWords,
  parseDisabledCategories,
  setCustomWords,
  setDisabledCategories,
} from '~/lib/settings';

async function stored(key: string): Promise<unknown> {
  return (await fakeBrowser.storage.sync.get(key))[key];
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('disabled categories', () => {
  it('keeps known engine types only, once each, in a fixed order', () => {
    expect(parseDisabledCategories(['DATE', 'PERSON', 'NOPE', 'DATE', 3, 'CUSTOM'])).toEqual([
      'PERSON',
      'DATE',
    ]);
    expect(parseDisabledCategories('PERSON')).toEqual([]);
    expect(parseDisabledCategories(undefined)).toEqual([]);
  });

  it('stores nothing for the default and the list otherwise', async () => {
    expect(await getDisabledCategories()).toEqual([]);

    await setDisabledCategories(['EMAIL', 'unknown']);
    expect(await stored(DISABLED_CATEGORIES_KEY)).toEqual(['EMAIL']);
    expect(await getDisabledCategories()).toEqual(['EMAIL']);

    await setDisabledCategories([]);
    expect(await stored(DISABLED_CATEGORIES_KEY)).toBeUndefined();
  });

  it('reports changes until unsubscribed', async () => {
    const seen: string[][] = [];
    const unsubscribe = onDisabledCategoriesChange((disabled) => seen.push(disabled));
    await setDisabledCategories(['PHONE']);
    await setDisabledCategories([]);
    unsubscribe();
    await setDisabledCategories(['PHONE']);

    expect(seen).toEqual([['PHONE'], []]);
  });
});

describe('custom words', () => {
  it.each([
    ['Feniks', false],
    ['sp. z o.o.', false],
    ['KS-\\d+', true],
    ['a|b', true],
    ['C++', true],
    ['(tajne)', true],
    ['^start', true],
  ])('%s looks like a regex: %s', (value, expected) => {
    expect(looksLikeRegex(value)).toBe(expected);
  });

  it('trims entries, drops unusable and duplicate ones, and fills in a missing flag', () => {
    expect(
      parseCustomWords([
        { value: '  Feniks ', regex: false },
        { value: 'FENIKS', regex: false },
        { value: 'feniks', regex: true },
        { value: 'KS-\\d+' },
        { value: '   ' },
        { value: 'x'.repeat(MAX_CUSTOM_WORD_LENGTH + 1) },
        { value: 42 },
        'loose string',
      ]),
    ).toEqual([
      { value: 'Feniks', regex: false },
      { value: 'feniks', regex: true },
      { value: 'KS-\\d+', regex: true },
    ]);
    expect(parseCustomWords({ value: 'x' })).toEqual([]);
  });

  it(`keeps at most ${String(MAX_CUSTOM_WORDS)} entries`, () => {
    const many = Array.from({ length: MAX_CUSTOM_WORDS + 5 }, (_, index) => ({
      value: `w${String(index)}`,
      regex: false,
    }));
    expect(parseCustomWords(many)).toHaveLength(MAX_CUSTOM_WORDS);
  });

  it('stores the parsed list and removes the key for an empty one', async () => {
    await setCustomWords([{ value: ' Feniks ', regex: false }]);
    expect(await stored(CUSTOM_WORDS_KEY)).toEqual([{ value: 'Feniks', regex: false }]);
    expect(await getCustomWords()).toEqual([{ value: 'Feniks', regex: false }]);

    await setCustomWords([]);
    expect(await stored(CUSTOM_WORDS_KEY)).toBeUndefined();
  });

  it('refuses a list larger than one storage.sync item without writing it', async () => {
    await setCustomWords([{ value: 'Feniks', regex: false }]);
    const large = Array.from({ length: 60 }, (_, index) => ({
      value: `${'ż'.repeat(100)}${String(index)}`,
      regex: false,
    }));

    await expect(setCustomWords(large)).rejects.toBeInstanceOf(CustomWordsTooLargeError);
    expect(await getCustomWords()).toEqual([{ value: 'Feniks', regex: false }]);
  });

  it('reports changes until unsubscribed', async () => {
    const seen: string[][] = [];
    const unsubscribe = onCustomWordsChange((words) => seen.push(words.map((w) => w.value)));
    await setCustomWords([{ value: 'a', regex: false }]);
    unsubscribe();
    await setCustomWords([]);

    expect(seen).toEqual([['a']]);
  });
});

describe('getDetectionSettings', () => {
  it('reads both lists, validated', async () => {
    await fakeBrowser.storage.sync.set({
      [DISABLED_CATEGORIES_KEY]: ['DATE', 'bogus'],
      [CUSTOM_WORDS_KEY]: [{ value: 'Feniks', regex: false }, null],
    });

    expect(await getDetectionSettings()).toEqual({
      disabledCategories: ['DATE'],
      customWords: [{ value: 'Feniks', regex: false }],
    });
  });
});
