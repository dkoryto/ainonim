import { browser } from 'wxt/browser';
import type { CustomWord } from '~/lib/shared/custom-words';
import { ENGINE_ENTITY_TYPES } from '~/lib/shared/labels';
import { SYNC_ITEM_QUOTA_BYTES, isRecord, onSyncChange } from './storage';

export type { CustomWord } from '~/lib/shared/custom-words';

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

/** storage.sync key holding the CustomWord list; absent means none. */
export const CUSTOM_WORDS_KEY = 'customWords';
/** Caps that keep matching cheap: every entry runs over every analysed text. */
export const MAX_CUSTOM_WORDS = 200;
export const MAX_CUSTOM_WORD_LENGTH = 200;

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

/** What the service worker applies to every analysis (lib/background/refine.ts). */
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
