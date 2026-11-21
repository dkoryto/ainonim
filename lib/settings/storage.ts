// Helpers shared by the settings modules: every setting lives in storage.sync.

import { browser } from 'wxt/browser';

/** chrome.storage.sync's QUOTA_BYTES_PER_ITEM: the key plus the value's JSON. */
export const SYNC_ITEM_QUOTA_BYTES = 8192;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type StorageChanges = Partial<Record<string, { oldValue?: unknown; newValue?: unknown }>>;

/** Calls `callback` with the old and new raw value of a storage.sync key. Returns an unsubscribe. */
export function onSyncChange(
  key: string,
  callback: (oldValue: unknown, newValue: unknown) => void,
) {
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
 * get/set/onChange for one synced value with a default. The default is never stored, so an
 * unchanged setting takes no sync quota and a later default change reaches everyone.
 */
export function syncedSetting<T>(
  key: string,
  isValid: (value: unknown) => value is T,
  fallback: T,
) {
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
