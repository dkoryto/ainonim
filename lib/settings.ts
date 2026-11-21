import { browser } from 'wxt/browser';

/**
 * How AInonim behaves on one site. Levels are ordered from the most to the least active; a
 * future 'auto' level goes into SITE_LEVELS, and versions that do not know it ignore it.
 */
export const SITE_LEVELS = ['warn', 'off'] as const;
export type SiteLevel = (typeof SITE_LEVELS)[number];

export const DEFAULT_SITE_LEVEL: SiteLevel = 'warn';

/** storage.sync key holding `{ [hostname]: level }`. Only non-default levels are stored. */
export const SITE_LEVELS_KEY = 'siteLevels';

export interface SiteLevelChange {
  hostname: string;
  level: SiteLevel;
}

export function isSiteLevel(value: unknown): value is SiteLevel {
  return typeof value === 'string' && (SITE_LEVELS as readonly string[]).includes(value);
}

/** Lowercase and drop the port; nothing else is rewritten (no `www.` stripping, no IDN mapping). */
export function normalizeHostname(host: string): string {
  const lower = host.toLowerCase();
  if (lower.startsWith('[')) {
    const end = lower.indexOf(']');
    return end === -1 ? lower : lower.slice(0, end + 1);
  }
  return lower.replace(/:\d*$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Known levels from a stored value; anything malformed or unknown is dropped. */
export function parseSiteLevels(raw: unknown): Map<string, SiteLevel> {
  const levels = new Map<string, SiteLevel>();
  if (!isRecord(raw)) return levels;
  for (const [hostname, level] of Object.entries(raw)) {
    if (hostname !== '' && isSiteLevel(level)) levels.set(hostname, level);
  }
  return levels;
}

async function readRaw(): Promise<Record<string, unknown>> {
  const stored = await browser.storage.sync.get(SITE_LEVELS_KEY);
  const raw = stored[SITE_LEVELS_KEY];
  return isRecord(raw) ? raw : {};
}

export async function getSiteLevel(hostname: string): Promise<SiteLevel> {
  const levels = parseSiteLevels(await readRaw());
  return levels.get(normalizeHostname(hostname)) ?? DEFAULT_SITE_LEVEL;
}

// Writes from one context are serialised so that two quick toggles do not lose an update.
let pendingWrite: Promise<void> = Promise.resolve();

export function setSiteLevel(hostname: string, level: SiteLevel): Promise<void> {
  const key = normalizeHostname(hostname);
  if (key === '') return Promise.reject(new TypeError('hostname must not be empty'));
  if (!isSiteLevel(level))
    return Promise.reject(new TypeError(`unknown site level: ${String(level)}`));

  const write = pendingWrite.then(async () => {
    // Entries this version does not understand (e.g. a newer level synced from another device)
    // are written back unchanged rather than dropped.
    const next = Object.create(null) as Record<string, unknown>;
    for (const [name, value] of Object.entries(await readRaw())) {
      if (name !== key) next[name] = value;
    }
    if (level !== DEFAULT_SITE_LEVEL) next[key] = level;

    if (Object.keys(next).length === 0) await browser.storage.sync.remove(SITE_LEVELS_KEY);
    else await browser.storage.sync.set({ [SITE_LEVELS_KEY]: next });
  });
  pendingWrite = write.catch(() => undefined);
  return write;
}

/** Calls `callback` for every hostname whose effective level changed. Returns an unsubscribe. */
export function onSiteLevelChange(callback: (change: SiteLevelChange) => void): () => void {
  const listener = (
    changes: Partial<Record<string, { oldValue?: unknown; newValue?: unknown }>>,
    areaName: string,
  ): void => {
    const change = changes[SITE_LEVELS_KEY];
    if (areaName !== 'sync' || change === undefined) return;
    const before = parseSiteLevels(change.oldValue);
    const after = parseSiteLevels(change.newValue);
    for (const hostname of new Set([...before.keys(), ...after.keys()])) {
      const oldLevel = before.get(hostname) ?? DEFAULT_SITE_LEVEL;
      const newLevel = after.get(hostname) ?? DEFAULT_SITE_LEVEL;
      if (oldLevel !== newLevel) callback({ hostname, level: newLevel });
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}

/**
 * How tokens look in chat messages: `restore` writes the originals in their place, `peek` keeps
 * the tokens on screen, highlighted, and shows the original only on hover. One setting for all
 * chat sites, synced like the site levels.
 */
export const CHAT_DISPLAYS = ['restore', 'peek'] as const;
export type ChatDisplay = (typeof CHAT_DISPLAYS)[number];

export const DEFAULT_CHAT_DISPLAY: ChatDisplay = 'restore';

/** storage.sync key holding the ChatDisplay; absent means the default. */
export const CHAT_DISPLAY_KEY = 'chatDisplay';

export function isChatDisplay(value: unknown): value is ChatDisplay {
  return typeof value === 'string' && (CHAT_DISPLAYS as readonly string[]).includes(value);
}

export async function getChatDisplay(): Promise<ChatDisplay> {
  const stored = await browser.storage.sync.get(CHAT_DISPLAY_KEY);
  const value = stored[CHAT_DISPLAY_KEY];
  return isChatDisplay(value) ? value : DEFAULT_CHAT_DISPLAY;
}

export async function setChatDisplay(display: ChatDisplay): Promise<void> {
  if (!isChatDisplay(display)) throw new TypeError(`unknown chat display: ${String(display)}`);
  if (display === DEFAULT_CHAT_DISPLAY) await browser.storage.sync.remove(CHAT_DISPLAY_KEY);
  else await browser.storage.sync.set({ [CHAT_DISPLAY_KEY]: display });
}

/** Calls `callback` with the new display whenever it changes. Returns an unsubscribe. */
export function onChatDisplayChange(callback: (display: ChatDisplay) => void): () => void {
  const listener = (
    changes: Partial<Record<string, { oldValue?: unknown; newValue?: unknown }>>,
    areaName: string,
  ): void => {
    const change = changes[CHAT_DISPLAY_KEY];
    if (areaName !== 'sync' || change === undefined) return;
    const before = isChatDisplay(change.oldValue) ? change.oldValue : DEFAULT_CHAT_DISPLAY;
    const after = isChatDisplay(change.newValue) ? change.newValue : DEFAULT_CHAT_DISPLAY;
    if (before !== after) callback(after);
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
