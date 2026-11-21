// Where the masking log is kept: `storage.local` under LOG_STORAGE_KEY, oldest entry first.
//
// Only the service worker appends (lib/background/worker.ts, `ainonim/log-append`): it takes the
// hostname from the sender's URL and the time from its own clock, checks the report, and serialises
// the writes of every tab. The options page and the report read and clear the log directly. The
// worker also limits `storage.local` to trusted contexts, so a content script can append through
// the worker but cannot read the log back.

import { browser } from 'wxt/browser';
import { type LogEntry, appendEntry, parseLog } from '~/lib/shared/log-entries';

export const LOG_STORAGE_KEY = 'maskingLog';

export async function readLog(): Promise<LogEntry[]> {
  return parseLog((await browser.storage.local.get(LOG_STORAGE_KEY))[LOG_STORAGE_KEY]);
}

// Appends from one context run one after another, so two quick maskings never lose an entry.
let pending: Promise<void> = Promise.resolve();

export function appendLogEntry(entry: LogEntry): Promise<void> {
  const write = pending.then(async () => {
    await browser.storage.local.set({ [LOG_STORAGE_KEY]: appendEntry(await readLog(), entry) });
  });
  pending = write.catch(() => undefined);
  return write;
}

export async function clearLog(): Promise<void> {
  await browser.storage.local.remove(LOG_STORAGE_KEY);
}

/** Calls `callback` with the whole log whenever it changes. Returns an unsubscribe. */
export function onLogChange(callback: (log: LogEntry[]) => void): () => void {
  const listener = (
    changes: Partial<Record<string, { newValue?: unknown }>>,
    areaName: string,
  ): void => {
    const change = changes[LOG_STORAGE_KEY];
    if (areaName === 'local' && change !== undefined) callback(parseLog(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
