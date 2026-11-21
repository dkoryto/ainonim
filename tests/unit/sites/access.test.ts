import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  type SiteAccess,
  type SiteAccessSettings,
  getEffectiveLevel,
  getSiteAccess,
  resolveSiteAccess,
  watchSiteAccess,
} from '~/lib/sites/access';
import { setAllowedSites, setSiteLevel, setSiteScope } from '~/lib/settings';

beforeEach(() => {
  fakeBrowser.reset();
});

const settings = (over: Partial<SiteAccessSettings> = {}): SiteAccessSettings => ({
  scope: 'all',
  allowedSites: [],
  siteLevels: new Map(),
  ...over,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('resolveSiteAccess', () => {
  it('runs everywhere with the default scope', () => {
    expect(resolveSiteAccess('https://example.com/', settings())).toEqual({
      level: 'warn',
      reason: 'all',
    });
  });

  it('keeps a blocked site off in every scope', () => {
    const siteLevels = new Map([['chatgpt.com', 'off' as const]]);
    for (const scope of ['all', 'chats', 'list'] as const) {
      const access = resolveSiteAccess(
        'https://chatgpt.com/',
        settings({ scope, siteLevels, allowedSites: ['chatgpt.com'] }),
      );
      expect(access).toEqual({ level: 'off', reason: 'blocked' });
    }
  });

  it('with "chats" runs only where a chat adapter matches', () => {
    const chats = settings({ scope: 'chats' });
    expect(resolveSiteAccess('https://chatgpt.com/c/1', chats)).toEqual({
      level: 'warn',
      reason: 'chat',
    });
    expect(resolveSiteAccess('https://example.com/', chats)).toEqual({
      level: 'off',
      reason: 'not-chat',
    });
  });

  it('with "list" runs only on listed sites, wildcards included', () => {
    const list = settings({ scope: 'list', allowedSites: ['127.0.0.1', '*.example.com'] });
    expect(resolveSiteAccess('http://127.0.0.1:8080/x', list).reason).toBe('listed');
    expect(resolveSiteAccess('https://example.com/', list).reason).toBe('listed');
    expect(resolveSiteAccess('https://a.example.com/', list).reason).toBe('listed');
    expect(resolveSiteAccess('https://chatgpt.com/', list)).toEqual({
      level: 'off',
      reason: 'not-listed',
    });
  });

  it('treats an unparsable URL as a page without a hostname', () => {
    expect(resolveSiteAccess('not a url', settings({ scope: 'chats' })).level).toBe('off');
    expect(resolveSiteAccess('not a url', settings()).level).toBe('warn');
  });
});

describe('getSiteAccess / getEffectiveLevel', () => {
  it('reads the three settings from storage', async () => {
    expect(await getEffectiveLevel('https://example.com/')).toBe('warn');
    await setSiteScope('list');
    expect(await getSiteAccess('https://example.com/')).toEqual({
      level: 'off',
      reason: 'not-listed',
    });
    await setAllowedSites(['example.com']);
    expect(await getEffectiveLevel('https://example.com/')).toBe('warn');
    await setSiteLevel('example.com', 'off');
    expect(await getEffectiveLevel('https://example.com/')).toBe('off');
  });

  it('ignores an unknown stored scope', async () => {
    await fakeBrowser.storage.sync.set({ siteScope: 'nowhere' });
    expect(await getEffectiveLevel('https://example.com/')).toBe('warn');
  });
});

describe('watchSiteAccess', () => {
  it('reports the access now and after each change of any of the keys', async () => {
    const seen: SiteAccess[] = [];
    const stop = watchSiteAccess('https://example.com/', (access) => seen.push(access));
    await flush();

    await setSiteScope('list');
    await flush();
    await setAllowedSites(['*.example.com']);
    await flush();
    await setSiteLevel('example.com', 'off');
    await flush();
    await setSiteLevel('other.pl', 'off');
    await flush();

    expect(seen.map((access) => access.reason)).toEqual(['all', 'not-listed', 'listed', 'blocked']);

    stop();
    await setSiteLevel('example.com', 'warn');
    await flush();
    expect(seen).toHaveLength(4);
  });

  it('assumes the default access when the settings cannot be read', async () => {
    vi.spyOn(fakeBrowser.storage.sync, 'get').mockRejectedValueOnce(
      new Error('storage unavailable'),
    );
    const seen: SiteAccess[] = [];

    watchSiteAccess('https://example.com/', (access) => seen.push(access));
    await flush();

    expect(seen).toEqual([{ level: 'warn', reason: 'all' }]);
    vi.restoreAllMocks();
  });

  it('reports nothing once stopped, even a read already under way', async () => {
    const seen: SiteAccess[] = [];
    const stop = watchSiteAccess('https://example.com/', (access) => seen.push(access));
    stop();
    await flush();

    expect(seen).toEqual([]);
  });

  it('reports only the latest of several quick changes', async () => {
    const seen: SiteAccess[] = [];
    watchSiteAccess('https://example.com/', (access) => seen.push(access));
    await flush();

    void setSiteScope('list');
    void setSiteScope('chats');
    await flush();
    await flush();

    expect(seen.map((access) => access.reason)).toEqual(['all', 'not-chat']);
  });
});
