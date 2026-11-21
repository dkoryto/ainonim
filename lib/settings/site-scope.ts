import { browser } from 'wxt/browser';
import { parseSitePattern } from './site-patterns';
import { SYNC_ITEM_QUOTA_BYTES, onSyncChange, syncedSetting } from './storage';

/**
 * Where AInonim works: `all` on every site, `chats` only on the AI chat sites it has an adapter
 * for (lib/sites), `list` only on the user's allow-list. Sites set to `off` (SITE_LEVELS_KEY) stay
 * off in every scope. lib/sites/access.ts combines the three into a site's effective level.
 */
export const SITE_SCOPES = ['all', 'chats', 'list'] as const;
export type SiteScope = (typeof SITE_SCOPES)[number];

export const DEFAULT_SITE_SCOPE: SiteScope = 'all';

/** storage.sync key holding the SiteScope; absent means the default. */
export const SITE_SCOPE_KEY = 'siteScope';

export function isSiteScope(value: unknown): value is SiteScope {
  return typeof value === 'string' && (SITE_SCOPES as readonly string[]).includes(value);
}

const siteScope = syncedSetting(SITE_SCOPE_KEY, isSiteScope, DEFAULT_SITE_SCOPE);

export const getSiteScope = siteScope.get;
export const setSiteScope = siteScope.set;
export const onSiteScopeChange = siteScope.onChange;

/**
 * storage.sync key holding the allow-list: canonical patterns from lib/settings/site-patterns.ts.
 */
export const ALLOWED_SITES_KEY = 'allowedSites';
export const MAX_ALLOWED_SITES = 200;

/** Thrown when the allow-list does not fit into one storage.sync item. */
export class SiteListTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `The list takes ${String(bytes)} bytes; storage.sync holds ${String(SYNC_ITEM_QUOTA_BYTES)}.`,
    );
    this.name = 'SiteListTooLargeError';
  }
}

/** Usable patterns from a stored value, canonical, without duplicates, at most MAX_ALLOWED_SITES. */
export function parseAllowedSites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const sites: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const parsed = parseSitePattern(item);
    if (!parsed.ok || sites.includes(parsed.pattern)) continue;
    sites.push(parsed.pattern);
    if (sites.length === MAX_ALLOWED_SITES) break;
  }
  return sites;
}

export async function getAllowedSites(): Promise<string[]> {
  const stored = await browser.storage.sync.get(ALLOWED_SITES_KEY);
  return parseAllowedSites(stored[ALLOWED_SITES_KEY]);
}

/** Store the usable patterns of `sites`; rejects with SiteListTooLargeError before writing. */
export async function setAllowedSites(sites: readonly string[]): Promise<void> {
  const parsed = parseAllowedSites(sites);
  if (parsed.length === 0) {
    await browser.storage.sync.remove(ALLOWED_SITES_KEY);
    return;
  }
  const bytes = new TextEncoder().encode(ALLOWED_SITES_KEY + JSON.stringify(parsed)).length;
  if (bytes > SYNC_ITEM_QUOTA_BYTES) throw new SiteListTooLargeError(bytes);
  await browser.storage.sync.set({ [ALLOWED_SITES_KEY]: parsed });
}

// Read-modify-write of the allow-list, serialised like setSiteLevel.
let pendingAllowedWrite: Promise<void> = Promise.resolve();

function updateAllowedSites(change: (sites: string[]) => string[]): Promise<void> {
  const write = pendingAllowedWrite.then(async () => {
    await setAllowedSites(change(await getAllowedSites()));
  });
  pendingAllowedWrite = write.catch(() => undefined);
  return write;
}

/** Add a canonical pattern (see parseSitePattern) to the allow-list. */
export function addAllowedSite(pattern: string): Promise<void> {
  const parsed = parseSitePattern(pattern);
  if (!parsed.ok) return Promise.reject(new TypeError(`invalid site pattern: ${pattern}`));
  return updateAllowedSites((sites) => {
    if (sites.includes(parsed.pattern)) return sites;
    if (sites.length >= MAX_ALLOWED_SITES) {
      throw new RangeError(`at most ${String(MAX_ALLOWED_SITES)} sites`);
    }
    return [...sites, parsed.pattern];
  });
}

export function removeAllowedSite(pattern: string): Promise<void> {
  return updateAllowedSites((sites) => sites.filter((site) => site !== pattern));
}

/** Calls `callback` with the allow-list whenever it changes. Returns an unsubscribe. */
export function onAllowedSitesChange(callback: (sites: string[]) => void): () => void {
  return onSyncChange(ALLOWED_SITES_KEY, (_oldValue, newValue) => {
    callback(parseAllowedSites(newValue));
  });
}
