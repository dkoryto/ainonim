import { browser } from 'wxt/browser';
import { CUSTOM_ENTITY_TYPE, ENGINE_ENTITY_TYPES } from './ui/labels';

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

type StorageChanges = Partial<Record<string, { oldValue?: unknown; newValue?: unknown }>>;

/** Calls `callback` with the old and new raw value of a storage.sync key. Returns an unsubscribe. */
function onSyncChange(key: string, callback: (oldValue: unknown, newValue: unknown) => void) {
  const listener = (changes: StorageChanges, areaName: string): void => {
    const change = changes[key];
    if (areaName === 'sync' && change !== undefined) callback(change.oldValue, change.newValue);
  };
  browser.storage.onChanged.addListener(listener);
  return (): void => {
    browser.storage.onChanged.removeListener(listener);
  };
}

/**
 * storage.sync key holding the entity types the user switched off in the "Kategorie" tab, e.g.
 * `["DATE", "LOCATION"]`. Absent means every type is detected.
 */
export const DISABLED_CATEGORIES_KEY = 'disabledCategories';

/** Known entity types from a stored value, in ENGINE_ENTITY_TYPES order; the rest is dropped. */
export function parseDisabledCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set(raw.filter((value): value is string => typeof value === 'string'));
  return ENGINE_ENTITY_TYPES.filter((entityType) => wanted.has(entityType));
}

export async function getDisabledCategories(): Promise<string[]> {
  const stored = await browser.storage.sync.get(DISABLED_CATEGORIES_KEY);
  return parseDisabledCategories(stored[DISABLED_CATEGORIES_KEY]);
}

export async function setDisabledCategories(entityTypes: readonly string[]): Promise<void> {
  const disabled = parseDisabledCategories(entityTypes);
  if (disabled.length === 0) await browser.storage.sync.remove(DISABLED_CATEGORIES_KEY);
  else await browser.storage.sync.set({ [DISABLED_CATEGORIES_KEY]: disabled });
}

/** Calls `callback` with the disabled types whenever they change. Returns an unsubscribe. */
export function onDisabledCategoriesChange(callback: (disabled: string[]) => void): () => void {
  return onSyncChange(DISABLED_CATEGORIES_KEY, (_oldValue, newValue) => {
    callback(parseDisabledCategories(newValue));
  });
}

/**
 * One of the user's own words or phrases to mask ("Własne słowa" tab). With `regex` the value is
 * a regular expression; without, it matches as a whole word, ignoring case. Kept in storage.sync
 * so the list survives a reinstall; it never leaves the browser's own sync.
 */
export interface CustomWord {
  value: string;
  regex: boolean;
}

/** storage.sync key holding the CustomWord list; absent means none. */
export const CUSTOM_WORDS_KEY = 'customWords';
/** Caps that keep matching cheap: every entry runs over every analysed text. */
export const MAX_CUSTOM_WORDS = 200;
export const MAX_CUSTOM_WORD_LENGTH = 200;
/** chrome.storage.sync's QUOTA_BYTES_PER_ITEM: the key plus the value's JSON. */
export const SYNC_ITEM_QUOTA_BYTES = 8192;

const REGEX_METACHARACTERS = /[[\]\\+*?{}()|^$]/;

/** Whether an entry reads as a regular expression: it holds one of `[ ] \ + * ? { } ( ) | ^ $`. */
export function looksLikeRegex(value: string): boolean {
  return REGEX_METACHARACTERS.test(value);
}

/** Thrown when the list does not fit into one storage.sync item. */
export class CustomWordsTooLargeError extends Error {
  constructor(bytes: number) {
    super(
      `The list takes ${String(bytes)} bytes; storage.sync holds ${String(SYNC_ITEM_QUOTA_BYTES)}.`,
    );
    this.name = 'CustomWordsTooLargeError';
  }
}

/** A stored or imported entry, trimmed; undefined when it is not usable. */
export function parseCustomWord(raw: unknown): CustomWord | undefined {
  if (!isRecord(raw) || typeof raw.value !== 'string') return undefined;
  const value = raw.value.trim();
  if (value === '' || value.length > MAX_CUSTOM_WORD_LENGTH) return undefined;
  // An entry without the flag (written by hand) is classified the way the options page does it.
  const regex = typeof raw.regex === 'boolean' ? raw.regex : looksLikeRegex(value);
  return { value, regex };
}

/** What makes two entries the same: plain words match regardless of case, so they compare so. */
export function customWordKey(word: CustomWord): string {
  return word.regex ? `regex:${word.value}` : `word:${word.value.toLowerCase()}`;
}

/** Usable entries from a stored value, without duplicates and at most MAX_CUSTOM_WORDS. */
export function parseCustomWords(raw: unknown): CustomWord[] {
  if (!Array.isArray(raw)) return [];
  const words: CustomWord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const word = parseCustomWord(item);
    if (!word || seen.has(customWordKey(word))) continue;
    seen.add(customWordKey(word));
    words.push(word);
    if (words.length === MAX_CUSTOM_WORDS) break;
  }
  return words;
}

export async function getCustomWords(): Promise<CustomWord[]> {
  const stored = await browser.storage.sync.get(CUSTOM_WORDS_KEY);
  return parseCustomWords(stored[CUSTOM_WORDS_KEY]);
}

/**
 * Store the usable entries of `words`. Rejects with CustomWordsTooLargeError before writing when
 * they do not fit into one storage.sync item, and with the browser's error when the write fails.
 */
export async function setCustomWords(words: readonly CustomWord[]): Promise<void> {
  const parsed = parseCustomWords(words);
  if (parsed.length === 0) {
    await browser.storage.sync.remove(CUSTOM_WORDS_KEY);
    return;
  }
  const bytes = new TextEncoder().encode(CUSTOM_WORDS_KEY + JSON.stringify(parsed)).length;
  if (bytes > SYNC_ITEM_QUOTA_BYTES) throw new CustomWordsTooLargeError(bytes);
  await browser.storage.sync.set({ [CUSTOM_WORDS_KEY]: parsed });
}

/** Calls `callback` with the list whenever it changes. Returns an unsubscribe. */
export function onCustomWordsChange(callback: (words: CustomWord[]) => void): () => void {
  return onSyncChange(CUSTOM_WORDS_KEY, (_oldValue, newValue) => {
    callback(parseCustomWords(newValue));
  });
}

/** What the service worker applies to every analysis (lib/detection/refine.ts). */
export interface DetectionSettings {
  disabledCategories: string[];
  customWords: CustomWord[];
}

export async function getDetectionSettings(): Promise<DetectionSettings> {
  const stored = await browser.storage.sync.get([DISABLED_CATEGORIES_KEY, CUSTOM_WORDS_KEY]);
  return {
    disabledCategories: parseDisabledCategories(stored[DISABLED_CATEGORIES_KEY]),
    customWords: parseCustomWords(stored[CUSTOM_WORDS_KEY]),
  };
}
/**
 * When AInonim masks: `manual` only from the panel at the field; `auto` also on its own when a
 * message is sent from a chat site's composer (lib/content/auto-mask.ts), other pages working
 * manually; `typing` on every page as soon as the user pauses typing (lib/content/typing-mask.ts),
 * and on chat sites again on send, should anything be left. One setting for every site, synced
 * like the others. A version that does not know a stored mode reads it as the default.
 */
export const MASKING_MODES = ['manual', 'auto', 'typing'] as const;
export type MaskingMode = (typeof MASKING_MODES)[number];

export const DEFAULT_MASKING_MODE: MaskingMode = 'manual';

/** storage.sync key holding the MaskingMode; absent means the default. */
export const MASK_MODE_KEY = 'maskMode';

/** storage.sync key: `false` turns the masking log off; absent means on. */
export const LOG_ENABLED_KEY = 'maskingLogEnabled';

export const DEFAULT_LOG_ENABLED = true;

export function isMaskingMode(value: unknown): value is MaskingMode {
  return typeof value === 'string' && (MASKING_MODES as readonly string[]).includes(value);
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * get/set/onChange for one synced value with a default. The default is never stored, so an
 * unchanged setting takes no sync quota and a later default change reaches everyone.
 */
function syncedSetting<T>(key: string, isValid: (value: unknown) => value is T, fallback: T) {
  const read = (value: unknown): T => (isValid(value) ? value : fallback);
  return {
    get: async (): Promise<T> => read((await browser.storage.sync.get(key))[key]),
    set: async (value: T): Promise<void> => {
      if (!isValid(value)) throw new TypeError(`invalid value for ${key}: ${String(value)}`);
      if (value === fallback) await browser.storage.sync.remove(key);
      else await browser.storage.sync.set({ [key]: value });
    },
    onChange: (callback: (value: T) => void): (() => void) => {
      const listener = (
        changes: Partial<Record<string, { oldValue?: unknown; newValue?: unknown }>>,
        areaName: string,
      ): void => {
        const change = changes[key];
        if (areaName !== 'sync' || change === undefined) return;
        const after = read(change.newValue);
        if (read(change.oldValue) !== after) callback(after);
      };
      browser.storage.onChanged.addListener(listener);
      return () => {
        browser.storage.onChanged.removeListener(listener);
      };
    },
  };
}

const maskingMode = syncedSetting(MASK_MODE_KEY, isMaskingMode, DEFAULT_MASKING_MODE);
const logEnabled = syncedSetting(LOG_ENABLED_KEY, isBoolean, DEFAULT_LOG_ENABLED);

export const getMaskingMode = maskingMode.get;
export const setMaskingMode = maskingMode.set;
/** Calls `callback` with the new mode whenever it changes. Returns an unsubscribe. */
export const onMaskingModeChange = maskingMode.onChange;

/** Whether maskings are written to the log (lib/log/). */
export const getLogEnabled = logEnabled.get;
export const setLogEnabled = logEnabled.set;
export const onLogEnabledChange = logEnabled.onChange;

/**
 * What a value of each category is replaced with by default ("Kategorie" tab): its token or a
 * generalised text. The panel's "znacznik | ogólnie" switch starts from it, and automatic masking
 * uses it. The user's own words count as the category CUSTOM_ENTITY_TYPE.
 */
export const CATEGORY_MODES = ['token', 'general'] as const;
export type CategoryMode = (typeof CATEGORY_MODES)[number];

export const DEFAULT_CATEGORY_MODE: CategoryMode = 'token';

/** storage.sync key holding `{ [entityType]: mode }`. Only non-default modes are stored. */
export const CATEGORY_MODES_KEY = 'categoryModes';

export function isCategoryMode(value: unknown): value is CategoryMode {
  return typeof value === 'string' && (CATEGORY_MODES as readonly string[]).includes(value);
}

/** The types a mode can be set for: polanon's and the user's own words. */
export const MODE_ENTITY_TYPES: readonly string[] = [...ENGINE_ENTITY_TYPES, CUSTOM_ENTITY_TYPE];

/** Non-default modes of known types from a stored value; anything else is dropped. */
export function parseCategoryModes(raw: unknown): Map<string, CategoryMode> {
  const modes = new Map<string, CategoryMode>();
  if (!isRecord(raw)) return modes;
  for (const entityType of MODE_ENTITY_TYPES) {
    const mode = raw[entityType];
    if (isCategoryMode(mode) && mode !== DEFAULT_CATEGORY_MODE) modes.set(entityType, mode);
  }
  return modes;
}

/** The mode of `entityType` in `modes`; a type without one gets the default. */
export function categoryModeOf(
  modes: ReadonlyMap<string, CategoryMode>,
  entityType: string,
): CategoryMode {
  return modes.get(entityType) ?? DEFAULT_CATEGORY_MODE;
}

async function readCategoryModesRaw(): Promise<Record<string, unknown>> {
  const raw = (await browser.storage.sync.get(CATEGORY_MODES_KEY))[CATEGORY_MODES_KEY];
  return isRecord(raw) ? raw : {};
}

export async function getCategoryModes(): Promise<Map<string, CategoryMode>> {
  return parseCategoryModes(await readCategoryModesRaw());
}

let pendingCategoryModeWrite: Promise<void> = Promise.resolve();

/** Store the mode of one type; writes are serialised like the site levels'. */
export function setCategoryMode(entityType: string, mode: CategoryMode): Promise<void> {
  if (!MODE_ENTITY_TYPES.includes(entityType))
    return Promise.reject(new TypeError(`unknown entity type: ${entityType}`));
  if (!isCategoryMode(mode))
    return Promise.reject(new TypeError(`unknown category mode: ${String(mode)}`));

  const write = pendingCategoryModeWrite.then(async () => {
    // Entries this version does not understand (a newer type or mode) are kept as they are.
    const next = Object.create(null) as Record<string, unknown>;
    for (const [name, value] of Object.entries(await readCategoryModesRaw())) {
      if (name !== entityType) next[name] = value;
    }
    if (mode !== DEFAULT_CATEGORY_MODE) next[entityType] = mode;

    if (Object.keys(next).length === 0) await browser.storage.sync.remove(CATEGORY_MODES_KEY);
    else await browser.storage.sync.set({ [CATEGORY_MODES_KEY]: next });
  });
  pendingCategoryModeWrite = write.catch(() => undefined);
  return write;
}

/** Calls `callback` with the modes whenever they change. Returns an unsubscribe. */
export function onCategoryModesChange(
  callback: (modes: Map<string, CategoryMode>) => void,
): () => void {
  return onSyncChange(CATEGORY_MODES_KEY, (_oldValue, newValue) => {
    callback(parseCategoryModes(newValue));
  });
}
