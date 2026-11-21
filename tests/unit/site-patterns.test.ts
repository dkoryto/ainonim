import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { matchesSitePattern, parseSitePattern } from '~/lib/site-patterns';
import {
  ALLOWED_SITES_KEY,
  MAX_ALLOWED_SITES,
  SiteListTooLargeError,
  addAllowedSite,
  getAllowedSites,
  getBlockedSites,
  onAllowedSitesChange,
  parseAllowedSites,
  removeAllowedSite,
  setAllowedSites,
  setSiteLevel,
} from '~/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseSitePattern', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  Example.COM  ', 'example.com'],
    ['example.com.', 'example.com'],
    ['example.com:8080', 'example.com'],
    ['https://www.Example.com/path?q=1#x', 'www.example.com'],
    ['example.com/some/page', 'example.com'],
    ['localhost', 'localhost'],
    ['127.0.0.1', '127.0.0.1'],
    ['http://127.0.0.1:3000/', '127.0.0.1'],
    ['[::1]:8080', '[::1]'],
    ['zażółć.pl', 'xn--za-6ja4f8n1l.pl'],
    ['*.example.com', '*.example.com'],
    ['*.Sub.Example.com', '*.sub.example.com'],
    ['my_host.example.com', 'my_host.example.com'],
  ])('%j -> %s', (input, pattern) => {
    expect(parseSitePattern(input)).toEqual({ ok: true, pattern });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['exa mple.com', 'invalid'],
    ['-bad.com', 'invalid'],
    ['user@example.com', 'invalid'],
    ['https://user:pw@example.com', 'invalid'],
    ['ftp://example.com', 'invalid'],
    ['javascript://alert(1)', 'invalid'],
    ['*', 'invalid'],
    ['example.*', 'invalid'],
    ['a.*.example.com', 'invalid'],
    ['*.127.0.0.1', 'invalid'],
    [`${'a'.repeat(64)}.com`, 'invalid'],
    [`${'abcdefghi.'.repeat(26)}com`, 'invalid'],
    ['*.com', 'too-broad'],
  ])('%j is rejected as %s', (input, problem) => {
    expect(parseSitePattern(input)).toEqual({ ok: false, problem });
  });

  it('rejects a wildcard where only a single site is allowed', () => {
    expect(parseSitePattern('*.example.com', false)).toEqual({ ok: false, problem: 'wildcard' });
    expect(parseSitePattern('example.com', false)).toEqual({ ok: true, pattern: 'example.com' });
  });
});

describe('matchesSitePattern', () => {
  it.each([
    ['example.com', 'example.com', true],
    ['www.example.com', 'example.com', false],
    ['example.com', '*.example.com', true],
    ['a.b.example.com', '*.example.com', true],
    ['badexample.com', '*.example.com', false],
    ['example.com.evil.net', '*.example.com', false],
    ['example.com.', 'example.com', true],
  ])('%s against %s: %s', (hostname, pattern, expected) => {
    expect(matchesSitePattern(hostname, pattern)).toBe(expected);
  });
});

describe('allow-list storage', () => {
  it('parses stored values: canonical, valid, unique, capped', () => {
    expect(
      parseAllowedSites(['Example.com', 'example.com', 7, '*.com', 'bad host', '*.a.pl']),
    ).toEqual(['example.com', '*.a.pl']);
    expect(parseAllowedSites('example.com')).toEqual([]);
    const many = Array.from({ length: MAX_ALLOWED_SITES + 5 }, (_, i) => `s${String(i)}.pl`);
    expect(parseAllowedSites(many)).toHaveLength(MAX_ALLOWED_SITES);
  });

  it('adds and removes sites and reports the change', async () => {
    const seen: string[][] = [];
    onAllowedSitesChange((sites) => seen.push(sites));

    await addAllowedSite('example.com');
    await addAllowedSite('*.test.pl');
    await addAllowedSite('example.com');
    expect(await getAllowedSites()).toEqual(['example.com', '*.test.pl']);

    await removeAllowedSite('example.com');
    await removeAllowedSite('*.test.pl');
    expect(
      (await fakeBrowser.storage.sync.get(ALLOWED_SITES_KEY))[ALLOWED_SITES_KEY],
    ).toBeUndefined();
    expect(seen.at(-1)).toEqual([]);
  });

  it('rejects an invalid pattern and a list over the item quota', async () => {
    await expect(addAllowedSite('not a host')).rejects.toThrow(TypeError);
    const long = Array.from(
      { length: 80 },
      (_, i) => `${'a'.repeat(60)}.${'b'.repeat(60)}.s${String(i)}.pl`,
    );
    await expect(setAllowedSites(long)).rejects.toBeInstanceOf(SiteListTooLargeError);
    expect(await getAllowedSites()).toEqual([]);
  });

  it('refuses to add beyond MAX_ALLOWED_SITES', async () => {
    await setAllowedSites(Array.from({ length: MAX_ALLOWED_SITES }, (_, i) => `s${String(i)}.pl`));
    await expect(addAllowedSite('one-more.pl')).rejects.toThrow(RangeError);
  });

  it('lists the sites set to off as the block-list', async () => {
    await setSiteLevel('b.pl', 'off');
    await setSiteLevel('a.pl', 'off');
    expect(await getBlockedSites()).toEqual(['a.pl', 'b.pl']);
  });
});
