// Whether AInonim runs on a page: the site's own level (the block-list), the scope ("Gdzie działa
// AInonim") and the allow-list together. The content script starts and stops on this, the popup
// explains it.
import { browser } from 'wxt/browser';
import { matchesSitePattern } from './site-patterns';
import {
  ALLOWED_SITES_KEY,
  DEFAULT_SITE_LEVEL,
  DEFAULT_SITE_SCOPE,
  SITE_LEVELS_KEY,
  SITE_SCOPE_KEY,
  type SiteLevel,
  type SiteScope,
  isSiteScope,
  normalizeHostname,
  parseAllowedSites,
  parseSiteLevels,
} from './settings';
import { adapterFor } from './sites';

/** Why a site is on or off: `blocked` is the site's own "Wyłączone", the rest come from the scope. */
export type SiteAccessReason = 'blocked' | 'all' | 'chat' | 'listed' | 'not-chat' | 'not-listed';

export interface SiteAccess {
  level: SiteLevel;
  reason: SiteAccessReason;
}

export interface SiteAccessSettings {
  scope: SiteScope;
  allowedSites: readonly string[];
  siteLevels: ReadonlyMap<string, SiteLevel>;
}

const ACCESS_KEYS = [SITE_LEVELS_KEY, SITE_SCOPE_KEY, ALLOWED_SITES_KEY];

function parseUrl(url: URL | string): URL | null {
  if (typeof url !== 'string') return url;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** The effective level of the page at `url` under `settings`. */
export function resolveSiteAccess(url: URL | string, settings: SiteAccessSettings): SiteAccess {
  const parsed = parseUrl(url);
  const hostname = normalizeHostname(parsed?.hostname ?? '');
  const own = settings.siteLevels.get(hostname) ?? DEFAULT_SITE_LEVEL;
  if (own === 'off') return { level: 'off', reason: 'blocked' };
  switch (settings.scope) {
    case 'all':
      return { level: own, reason: 'all' };
    case 'chats':
      return parsed !== null && adapterFor(parsed) !== null
        ? { level: own, reason: 'chat' }
        : { level: 'off', reason: 'not-chat' };
    case 'list':
      return settings.allowedSites.some((pattern) => matchesSitePattern(hostname, pattern))
        ? { level: own, reason: 'listed' }
        : { level: 'off', reason: 'not-listed' };
  }
}

export async function getSiteAccessSettings(): Promise<SiteAccessSettings> {
  const stored = await browser.storage.sync.get(ACCESS_KEYS);
  const scope = stored[SITE_SCOPE_KEY];
  return {
    scope: isSiteScope(scope) ? scope : DEFAULT_SITE_SCOPE,
    allowedSites: parseAllowedSites(stored[ALLOWED_SITES_KEY]),
    siteLevels: parseSiteLevels(stored[SITE_LEVELS_KEY]),
  };
}

export async function getSiteAccess(url: URL | string): Promise<SiteAccess> {
  return resolveSiteAccess(url, await getSiteAccessSettings());
}

export async function getEffectiveLevel(url: URL | string): Promise<SiteLevel> {
  return (await getSiteAccess(url)).level;
}

/** What is assumed when the settings cannot be read: the default, as before scopes existed. */
const FALLBACK_ACCESS: SiteAccess = { level: DEFAULT_SITE_LEVEL, reason: 'all' };

const sameAccess = (a: SiteAccess, b: SiteAccess): boolean =>
  a.level === b.level && a.reason === b.reason;

/**
 * Calls `callback` with the page's access now and again whenever a change to the site levels, the
 * scope or the allow-list changes it. Every change re-reads all three, and only the newest read
 * is delivered, so a slow read never overwrites a newer one. Returns an unsubscribe.
 */
export function watchSiteAccess(
  url: URL | string,
  callback: (access: SiteAccess) => void,
): () => void {
  let generation = 0;
  let last: SiteAccess | undefined;
  let stopped = false;

  const refresh = (): void => {
    const mine = ++generation;
    void getSiteAccess(url)
      .catch(() => FALLBACK_ACCESS)
      .then((access) => {
        if (stopped || mine !== generation) return;
        if (last !== undefined && sameAccess(last, access)) return;
        last = access;
        callback(access);
      });
  };

  const listener = (changes: Record<string, unknown>, areaName: string): void => {
    if (areaName === 'sync' && ACCESS_KEYS.some((key) => key in changes)) refresh();
  };
  browser.storage.onChanged.addListener(listener);
  refresh();
  return () => {
    stopped = true;
    browser.storage.onChanged.removeListener(listener);
  };
}
