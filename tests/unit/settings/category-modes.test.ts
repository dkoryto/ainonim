import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CATEGORY_MODES_KEY,
  type CategoryMode,
  categoryModeOf,
  getCategoryModes,
  onCategoryModesChange,
  parseCategoryModes,
  setCategoryMode,
} from '~/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('category modes', () => {
  const storedModes = async (): Promise<unknown> =>
    (await fakeBrowser.storage.sync.get(CATEGORY_MODES_KEY))[CATEGORY_MODES_KEY];

  it('parses known types with a non-default mode and drops the rest', () => {
    const modes = parseCategoryModes({
      PESEL: 'general',
      PERSON: 'token',
      CUSTOM: 'general',
      NOT_A_TYPE: 'general',
      EMAIL: 'blurred',
    });

    expect([...modes]).toEqual([
      ['PESEL', 'general'],
      ['CUSTOM', 'general'],
    ]);
    expect(categoryModeOf(modes, 'PESEL')).toBe('general');
    expect(categoryModeOf(modes, 'EMAIL')).toBe('token');
    expect(parseCategoryModes(['PESEL'])).toEqual(new Map());
    expect(parseCategoryModes(undefined)).toEqual(new Map());
  });

  it('stores only non-default modes and removes the key when none is left', async () => {
    expect(await getCategoryModes()).toEqual(new Map());

    await setCategoryMode('PESEL', 'general');
    await setCategoryMode('CUSTOM', 'general');
    expect(await storedModes()).toEqual({ PESEL: 'general', CUSTOM: 'general' });

    await setCategoryMode('PESEL', 'token');
    await setCategoryMode('CUSTOM', 'token');
    expect(await fakeBrowser.storage.sync.get(CATEGORY_MODES_KEY)).toEqual({});
  });

  it('keeps entries this version does not understand', async () => {
    await fakeBrowser.storage.sync.set({ [CATEGORY_MODES_KEY]: { FUTURE: 'hash' } });

    await setCategoryMode('EMAIL', 'general');

    expect(await storedModes()).toEqual({ FUTURE: 'hash', EMAIL: 'general' });
  });

  it('serialises quick writes so none is lost', async () => {
    await Promise.all([setCategoryMode('PESEL', 'general'), setCategoryMode('NIP', 'general')]);

    expect(await storedModes()).toEqual({ PESEL: 'general', NIP: 'general' });
  });

  it('rejects an unknown type or mode', async () => {
    await expect(setCategoryMode('NOT_A_TYPE', 'general')).rejects.toThrow(TypeError);
    await expect(setCategoryMode('PESEL', 'blurred' as CategoryMode)).rejects.toThrow(TypeError);
  });

  it('reports changes', async () => {
    const seen: [string, CategoryMode][][] = [];
    const stop = onCategoryModesChange((modes) => seen.push([...modes]));

    await setCategoryMode('PESEL', 'general');
    stop();
    await setCategoryMode('NIP', 'general');

    expect(seen).toEqual([[['PESEL', 'general']]]);
  });
});
