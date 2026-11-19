import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { describeTabUrl, unsupportedNote } from '~/entrypoints/popup/tab-target';
import {
  SITE_LEVELS_KEY,
  type SiteLevelChange,
  getSiteLevel,
  normalizeHostname,
  onSiteLevelChange,
  parseSiteLevels,
  setSiteLevel,
} from '~/lib/settings';

async function stored(): Promise<unknown> {
  return (await fakeBrowser.storage.sync.get(SITE_LEVELS_KEY))[SITE_LEVELS_KEY];
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('normalizeHostname', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['example.com:8080', 'example.com'],
    ['127.0.0.1:3000', '127.0.0.1'],
    ['[::1]:8080', '[::1]'],
    ['[::1]', '[::1]'],
    ['www.example.com', 'www.example.com'],
    ['xn--zca.pl', 'xn--zca.pl'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });
});

describe('parseSiteLevels', () => {
  it('keeps known levels and drops everything else', () => {
    const levels = parseSiteLevels({
      'a.pl': 'off',
      'b.pl': 'warn',
      'c.pl': 'auto',
      'd.pl': 1,
      '': 'off',
    });

    expect([...levels]).toEqual([
      ['a.pl', 'off'],
      ['b.pl', 'warn'],
    ]);
  });

  it.each([undefined, null, 'off', ['off'], 42])('returns no entries for %j', (raw) => {
    expect(parseSiteLevels(raw).size).toBe(0);
  });

  it('treats __proto__ as an ordinary hostname key', () => {
    const levels = parseSiteLevels(JSON.parse('{"__proto__": "off"}'));

    expect(levels.get('__proto__')).toBe('off');
  });
});

describe('getSiteLevel / setSiteLevel', () => {
  it("defaults to 'warn' and stores nothing", async () => {
    expect(await getSiteLevel('example.com')).toBe('warn');
    expect(await stored()).toBeUndefined();
  });

  it('stores a non-default level under the normalised hostname', async () => {
    await setSiteLevel('Example.com:443', 'off');

    expect(await stored()).toEqual({ 'example.com': 'off' });
    expect(await getSiteLevel('EXAMPLE.COM')).toBe('off');
    expect(await getSiteLevel('other.com')).toBe('warn');
  });

  it('removes the entry, and the key once empty, when set back to the default', async () => {
    await setSiteLevel('a.pl', 'off');
    await setSiteLevel('b.pl', 'off');

    await setSiteLevel('a.pl', 'warn');
    expect(await stored()).toEqual({ 'b.pl': 'off' });

    await setSiteLevel('b.pl', 'warn');
    expect(await stored()).toBeUndefined();
  });

  it('does not lose updates made in quick succession', async () => {
    await Promise.all([setSiteLevel('a.pl', 'off'), setSiteLevel('b.pl', 'off')]);

    expect(await stored()).toEqual({ 'a.pl': 'off', 'b.pl': 'off' });
  });

  it('ignores unknown stored values when reading', async () => {
    await fakeBrowser.storage.sync.set({ [SITE_LEVELS_KEY]: { 'a.pl': 'auto', 'b.pl': 7 } });

    expect(await getSiteLevel('a.pl')).toBe('warn');
    expect(await getSiteLevel('b.pl')).toBe('warn');
  });

  it('falls back to the default when the stored value is not an object', async () => {
    await fakeBrowser.storage.sync.set({ [SITE_LEVELS_KEY]: 'off' });

    expect(await getSiteLevel('a.pl')).toBe('warn');
  });

  it('keeps entries it does not understand when writing another site', async () => {
    await fakeBrowser.storage.sync.set({ [SITE_LEVELS_KEY]: { 'a.pl': 'auto' } });

    await setSiteLevel('b.pl', 'off');

    expect(await stored()).toEqual({ 'a.pl': 'auto', 'b.pl': 'off' });
  });

  it('rejects an empty hostname and an unknown level', async () => {
    await expect(setSiteLevel('', 'off')).rejects.toThrow(TypeError);
    await expect(setSiteLevel(':80', 'off')).rejects.toThrow(TypeError);
    // @ts-expect-error: 'auto' is not a level yet
    await expect(setSiteLevel('a.pl', 'auto')).rejects.toThrow(TypeError);
    expect(await stored()).toBeUndefined();
  });
});

describe('onSiteLevelChange', () => {
  it('reports each hostname whose level changed', async () => {
    const changes: SiteLevelChange[] = [];
    onSiteLevelChange((change) => changes.push(change));

    await setSiteLevel('a.pl', 'off');
    await setSiteLevel('b.pl', 'off');
    await setSiteLevel('a.pl', 'warn');

    expect(changes).toEqual([
      { hostname: 'a.pl', level: 'off' },
      { hostname: 'b.pl', level: 'off' },
      { hostname: 'a.pl', level: 'warn' },
    ]);
  });

  it('ignores other keys, other areas and unknown levels', async () => {
    const callback = vi.fn();
    onSiteLevelChange(callback);

    await fakeBrowser.storage.sync.set({ other: { 'a.pl': 'off' } });
    await fakeBrowser.storage.local.set({ [SITE_LEVELS_KEY]: { 'a.pl': 'off' } });
    await fakeBrowser.storage.sync.set({ [SITE_LEVELS_KEY]: { 'a.pl': 'auto' } });

    expect(callback).not.toHaveBeenCalled();
  });

  it('stops after unsubscribing', async () => {
    const callback = vi.fn();
    const unsubscribe = onSiteLevelChange(callback);

    unsubscribe();
    await setSiteLevel('a.pl', 'off');

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('describeTabUrl (popup)', () => {
  it.each([
    ['https://chat.example.com/c/1', 'chat.example.com'],
    ['http://LOCALHOST:5173/', 'localhost'],
    ['https://[::1]:8443/', '[::1]'],
    ['https://chrome.google.com/search', 'chrome.google.com'],
  ])('offers the switch on %s', (url, hostname) => {
    expect(describeTabUrl(url)).toEqual({ kind: 'site', hostname });
  });

  it.each([
    ['chrome://extensions/', 'browser-page'],
    ['chrome-extension://abc/popup.html', 'browser-page'],
    ['about:blank', 'browser-page'],
    ['view-source:https://example.com/', 'browser-page'],
    ['https://chromewebstore.google.com/detail/x', 'web-store'],
    ['https://chrome.google.com/webstore/category/extensions', 'web-store'],
    ['file:///home/user/a.html', 'file'],
    ['not a url', 'unknown'],
    [undefined, 'unknown'],
  ] as const)('shows a note on %s', (url, reason) => {
    const target = describeTabUrl(url);

    expect(target).toEqual({ kind: 'unsupported', reason });
    if (target.kind === 'unsupported') expect(unsupportedNote(target)).not.toBe('');
  });
});
