import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  MAX_CONVERSATIONS,
  MappingConflictError,
  STORAGE_KEY,
  clearAll,
  clearMapping,
  getMapping,
  listMappings,
  mergeMapping,
  renameMapping,
} from '~/lib/background/mapping/store';

const CHAT = 'chatgpt:abc';
const OTHER = 'claude:xyz';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('mergeMapping / getMapping', () => {
  it('returns an empty mapping for an unknown conversation', async () => {
    expect(await getMapping(CHAT)).toEqual({});
  });

  it('adds new tokens and keeps existing ones', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });
    const merged = await mergeMapping(CHAT, {
      '<OSOBA_1>': 'Jan Kowalski',
      '<PESEL_1>': '50810112354',
    });

    const expected = { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' };
    expect(merged).toEqual(expected);
    expect(await getMapping(CHAT)).toEqual(expected);
    expect(await getMapping(OTHER)).toEqual({});
  });

  it('rejects a conflicting original without storing anything or exposing values', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });

    const error: unknown = await mergeMapping(CHAT, {
      '<OSOBA_1>': 'Anna Nowak',
      '<PESEL_1>': '50810112354',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MappingConflictError);
    expect((error as MappingConflictError).tokens).toEqual(['<OSOBA_1>']);
    expect((error as Error).message).not.toMatch(/Anna|Jan|5081/);
    expect(await getMapping(CHAT)).toEqual({ '<OSOBA_1>': 'Jan Kowalski' });
  });

  it.each([
    ['a non-string original', { '<OSOBA_1>': 1 }],
    ['an empty original', { '<OSOBA_1>': '' }],
    ['an empty token', { '': 'Jan' }],
  ])('rejects a mapping with %s', async (_label, mapping) => {
    await expect(mergeMapping(CHAT, mapping as Record<string, string>)).rejects.toThrow(TypeError);
  });

  it('rejects an empty conversation key', async () => {
    await expect(getMapping('')).rejects.toThrow(TypeError);
  });

  it('keeps every change from concurrent merges', async () => {
    await Promise.all([
      mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' }),
      mergeMapping(CHAT, { '<OSOBA_2>': 'Anna Nowak' }),
    ]);

    expect(await getMapping(CHAT)).toEqual({
      '<OSOBA_1>': 'Jan Kowalski',
      '<OSOBA_2>': 'Anna Nowak',
    });
  });

  it('does not store an empty conversation', async () => {
    await mergeMapping(CHAT, {});

    expect(await fakeBrowser.storage.session.get(STORAGE_KEY)).toEqual({});
  });
});

describe('clearMapping / clearAll', () => {
  beforeEach(async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });
    await mergeMapping(OTHER, { '<OSOBA_1>': 'Anna Nowak' });
  });

  it('removes one conversation', async () => {
    expect(await clearMapping(CHAT)).toBe(true);

    expect(await getMapping(CHAT)).toEqual({});
    expect(await getMapping(OTHER)).toEqual({ '<OSOBA_1>': 'Anna Nowak' });
  });

  it('reports a conversation that was not stored', async () => {
    expect(await clearMapping('chatgpt:unknown')).toBe(false);
    expect(await listMappings()).toHaveLength(2);
  });

  it('rejects an invalid key', async () => {
    await expect(clearMapping('')).rejects.toThrow(TypeError);
  });

  it('removes everything from storage', async () => {
    await clearAll();

    expect(await fakeBrowser.storage.session.get(STORAGE_KEY)).toEqual({});
  });
});

describe('listMappings', () => {
  it('is empty when nothing is stored', async () => {
    expect(await listMappings()).toEqual([]);
  });

  it('lists every conversation with its mapping, most recently used first', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });
    await mergeMapping(OTHER, { '<OSOBA_1>': 'Anna Nowak', '<PESEL_1>': '50810112354' });
    await getMapping(CHAT);

    expect(await listMappings()).toEqual([
      { key: CHAT, mapping: { '<OSOBA_1>': 'Jan Kowalski' } },
      { key: OTHER, mapping: { '<OSOBA_1>': 'Anna Nowak', '<PESEL_1>': '50810112354' } },
    ]);
  });

  it('does not count listing as using a conversation', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });
    await mergeMapping(OTHER, { '<OSOBA_1>': 'Anna Nowak' });
    const before = await fakeBrowser.storage.session.get(STORAGE_KEY);

    await listMappings();

    expect(await fakeBrowser.storage.session.get(STORAGE_KEY)).toEqual(before);
    expect((await listMappings()).map((conversation) => conversation.key)).toEqual([OTHER, CHAT]);
  });
});

describe('renameMapping', () => {
  const TEMP = 'chatgpt:new-1';

  it('moves a mapping to a key that has none', async () => {
    await mergeMapping(TEMP, { '<OSOBA_1>': 'Jan Kowalski' });

    expect(await renameMapping(TEMP, CHAT)).toEqual({ '<OSOBA_1>': 'Jan Kowalski' });
    expect(await getMapping(TEMP)).toEqual({});
    expect(await getMapping(CHAT)).toEqual({ '<OSOBA_1>': 'Jan Kowalski' });
  });

  it('merges into an existing target', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });
    await mergeMapping(TEMP, { '<OSOBA_1>': 'Jan Kowalski', '<PESEL_1>': '50810112354' });

    await renameMapping(TEMP, CHAT);

    expect(await getMapping(TEMP)).toEqual({});
    expect(await getMapping(CHAT)).toEqual({
      '<OSOBA_1>': 'Jan Kowalski',
      '<PESEL_1>': '50810112354',
    });
  });

  it('leaves both conversations unchanged on a conflict', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });
    await mergeMapping(TEMP, { '<OSOBA_1>': 'Anna Nowak' });

    await expect(renameMapping(TEMP, CHAT)).rejects.toBeInstanceOf(MappingConflictError);
    expect(await getMapping(CHAT)).toEqual({ '<OSOBA_1>': 'Jan Kowalski' });
    expect(await getMapping(TEMP)).toEqual({ '<OSOBA_1>': 'Anna Nowak' });
  });

  it('returns the target unchanged when the source does not exist', async () => {
    await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan Kowalski' });

    expect(await renameMapping(TEMP, CHAT)).toEqual({ '<OSOBA_1>': 'Jan Kowalski' });
  });
});

describe('eviction', () => {
  const key = (index: number) => `site:${String(index)}`;

  async function fill(count: number): Promise<void> {
    for (let index = 0; index < count; index++) {
      await mergeMapping(key(index), { '<OSOBA_1>': `Osoba ${String(index)}` });
    }
  }

  it(`keeps only the ${String(MAX_CONVERSATIONS)} most recently used conversations`, async () => {
    await fill(MAX_CONVERSATIONS + 1);

    expect(await getMapping(key(0))).toEqual({});
    expect(await getMapping(key(1))).toEqual({ '<OSOBA_1>': 'Osoba 1' });
    expect(await getMapping(key(MAX_CONVERSATIONS))).toEqual({ '<OSOBA_1>': 'Osoba 50' });
  });

  it('counts reading a conversation as using it', async () => {
    await fill(MAX_CONVERSATIONS);
    await getMapping(key(0));

    await mergeMapping('site:new', { '<OSOBA_1>': 'Nowa' });

    expect(await getMapping(key(0))).toEqual({ '<OSOBA_1>': 'Osoba 0' });
    expect(await getMapping(key(1))).toEqual({});
  });
});

describe('malformed storage data', () => {
  it.each([['a string'], [42], [null], [['an', 'array']]])('treats %j as empty', async (stored) => {
    await fakeBrowser.storage.session.set({ [STORAGE_KEY]: stored });

    expect(await getMapping(CHAT)).toEqual({});
    expect(await mergeMapping(CHAT, { '<OSOBA_1>': 'Jan' })).toEqual({ '<OSOBA_1>': 'Jan' });
  });

  it('ignores malformed conversations and pairs but keeps valid ones', async () => {
    await fakeBrowser.storage.session.set({
      [STORAGE_KEY]: {
        [CHAT]: { usedAt: 1, mapping: { '<OSOBA_1>': 'Jan', '<OSOBA_2>': 7, '<OSOBA_3>': '' } },
        'site:no-time': { mapping: { '<OSOBA_1>': 'Jan' } },
        'site:bad-time': { usedAt: 'yesterday', mapping: { '<OSOBA_1>': 'Jan' } },
        'site:no-mapping': { usedAt: 1 },
        'site:array': { usedAt: 1, mapping: ['Jan'] },
        'site:string': 'Jan',
      },
    });

    expect(await getMapping(CHAT)).toEqual({ '<OSOBA_1>': 'Jan' });
    for (const key of ['site:no-time', 'site:bad-time', 'site:no-mapping', 'site:array']) {
      expect(await getMapping(key)).toEqual({});
    }
    expect(await mergeMapping(CHAT, { '<OSOBA_2>': 'Anna' })).toEqual({
      '<OSOBA_1>': 'Jan',
      '<OSOBA_2>': 'Anna',
    });
  });
});
