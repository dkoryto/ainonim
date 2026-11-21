import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type LogEntry } from '~/lib/shared/log-entries';
import { LOG_STORAGE_KEY, appendLogEntry, clearLog, onLogChange, readLog } from '~/lib/log/store';

function entry(at: number, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    at,
    host: 'chatgpt.com',
    source: 'auto',
    masked: 1,
    generalised: 0,
    categories: { PERSON: 1 },
    ...overrides,
  };
}

describe('log store', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('appends, reads back, reports changes and clears', async () => {
    const seen: number[] = [];
    const stop = onLogChange((log) => seen.push(log.length));

    await Promise.all([appendLogEntry(entry(1)), appendLogEntry(entry(2))]);
    expect((await readLog()).map((e) => e.at)).toEqual([1, 2]);
    await clearLog();

    expect(await readLog()).toEqual([]);
    expect(seen).toEqual([1, 2, 0]);
    stop();
  });

  it('ignores a malformed stored value', async () => {
    await fakeBrowser.storage.local.set({ [LOG_STORAGE_KEY]: 'broken' });

    expect(await readLog()).toEqual([]);
    await appendLogEntry(entry(1));
    expect(await readLog()).toEqual([entry(1)]);
  });

  it('reports only changes of the log itself, until unsubscribed', async () => {
    const seen: number[] = [];
    const stop = onLogChange((log) => seen.push(log.length));

    await fakeBrowser.storage.local.set({ otherKey: 1 });
    await fakeBrowser.storage.sync.set({ [LOG_STORAGE_KEY]: [entry(1)] });
    await appendLogEntry(entry(2));
    stop();
    await appendLogEntry(entry(3));

    expect(seen).toEqual([1]);
  });
});
